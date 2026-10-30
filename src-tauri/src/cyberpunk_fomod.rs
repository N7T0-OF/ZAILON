use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use quick_xml::{events::Event, Reader};
use serde::{Deserialize, Serialize};
use std::{
    collections::{HashMap, HashSet},
    fs::{self, File},
    io::{copy, Read},
    path::{Path, PathBuf},
};
use zip::ZipArchive;

const MAX_ARCHIVE_ENTRIES: usize = 100_000;
const MAX_ARCHIVE_UNPACKED_BYTES: u64 = 4 * 1024 * 1024 * 1024;
const MAX_XML_BYTES: u64 = 4 * 1024 * 1024;
const MAX_XML_DEPTH: usize = 128;
const MAX_XML_NODES: usize = 100_000;
const MAX_IMAGE_BYTES: u64 = 1024 * 1024;
const MAX_PLAN_IMAGE_BYTES: u64 = 8 * 1024 * 1024;
const MAX_FOMOD_FILE_RULES: usize = 4_096;
const MAX_FOMOD_WARNINGS: usize = 256;
const MAX_FOMOD_FOLDER_RULES: usize = 8;
const MAX_ARCHIVE_PATH_BYTES: usize = 4_096;
const MAX_ARCHIVE_PATHS_BYTES: usize = 16 * 1024 * 1024;
const MAX_FOMOD_FOLDER_MEMBERS: usize = 4_096;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct FomodArchivePlan {
    pub name: String,
    pub author: Option<String>,
    pub version: Option<String>,
    /// `supported` means only static XML selections are used; script- or
    /// condition-driven installers are reported as unsupported and blocked.
    pub support_status: String,
    pub required_file_count: usize,
    pub archive_fingerprint: String,
    pub steps: Vec<FomodStep>,
    pub warnings: Vec<String>,
    #[serde(skip)]
    required_files: Vec<FomodFileRule>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct FomodStep {
    pub id: String,
    pub name: String,
    pub groups: Vec<FomodGroup>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct FomodGroup {
    pub id: String,
    pub name: String,
    pub selection_type: String,
    pub options: Vec<FomodOption>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct FomodOption {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub image_data_url: Option<String>,
    pub required: bool,
    pub selectable: bool,
    pub selected_by_default: bool,
    pub file_count: usize,
    pub targets: Vec<String>,
    #[serde(skip)]
    files: Vec<FomodFileRule>,
}

#[derive(Debug, Clone)]
struct FomodFileRule {
    source: String,
    destination: Option<String>,
    folder: bool,
    priority: i64,
}

#[derive(Debug, Clone)]
struct ArchiveEntry {
    path: String,
    index: usize,
    is_dir: bool,
    size: u64,
}

#[derive(Debug, Clone)]
struct ResolvedFile {
    archive_index: usize,
    target: PathBuf,
    size: u64,
    priority: i64,
}

#[derive(Debug, Clone)]
struct XmlElement {
    name: String,
    attributes: HashMap<String, String>,
    children: Vec<XmlElement>,
    content: Vec<XmlContent>,
    text: String,
}

#[derive(Debug, Clone)]
enum XmlContent {
    Text(String),
    Child(usize),
}

impl XmlElement {
    fn attribute(&self, name: &str) -> Option<&str> {
        self.attributes
            .iter()
            .find(|(key, _)| key.as_str() == name)
            .map(|(_, value)| value.as_str())
    }

    fn child(&self, name: &str) -> Option<&XmlElement> {
        self.children.iter().find(|child| child.name == name)
    }

    fn children_named<'a>(&'a self, name: &'a str) -> impl Iterator<Item = &'a XmlElement> {
        self.children.iter().filter(move |child| child.name == name)
    }

    fn descendants<'a>(&'a self, name: &'a str) -> Vec<&'a XmlElement> {
        let mut found = Vec::new();
        for child in &self.children {
            if child.name == name {
                found.push(child);
            }
            found.extend(child.descendants(name));
        }
        found
    }

    fn push_text(&mut self, value: &str) {
        self.text.push_str(value);
        match self.content.last_mut() {
            Some(XmlContent::Text(text)) => text.push_str(value),
            _ => self.content.push(XmlContent::Text(value.to_string())),
        }
    }

    fn raw_text_content(&self) -> String {
        let mut value = String::new();
        for part in &self.content {
            match part {
                XmlContent::Text(text) => value.push_str(text),
                XmlContent::Child(index) => {
                    if let Some(child) = self.children.get(*index) {
                        value.push_str(&child.raw_text_content());
                    }
                }
            }
        }
        value
    }

    fn text_content(&self) -> String {
        self.raw_text_content().trim().to_string()
    }
}

fn push_xml_child(stack: &mut [XmlElement], roots: &mut Vec<XmlElement>, element: XmlElement) {
    if let Some(parent) = stack.last_mut() {
        let child_index = parent.children.len();
        parent.children.push(element);
        parent.content.push(XmlContent::Child(child_index));
    } else {
        roots.push(element);
    }
}

fn xml_name(bytes: &[u8]) -> String {
    String::from_utf8_lossy(bytes).to_string()
}

fn decode_xml_reference(reference: &[u8]) -> Result<char, String> {
    let codepoint = if reference == b"amp" {
        0x26
    } else if reference == b"lt" {
        0x3C
    } else if reference == b"gt" {
        0x3E
    } else if reference == b"apos" {
        0x27
    } else if reference == b"quot" {
        0x22
    } else if reference.starts_with(b"#x") || reference.starts_with(b"#X") {
        let digits = std::str::from_utf8(&reference[2..]).map_err(|error| error.to_string())?;
        u32::from_str_radix(digits, 16)
            .map_err(|_| "FOMOD XML contains an invalid numeric entity reference.".to_string())?
    } else if reference.starts_with(b"#") {
        let digits = std::str::from_utf8(&reference[1..]).map_err(|error| error.to_string())?;
        digits
            .parse::<u32>()
            .map_err(|_| "FOMOD XML contains an invalid numeric entity reference.".to_string())?
    } else {
        return Err(format!(
            "FOMOD XML contains an unsupported entity reference: {}",
            xml_name(reference)
        ));
    };
    if !(codepoint == 0x9
        || codepoint == 0xA
        || codepoint == 0xD
        || (0x20..=0xD7FF).contains(&codepoint)
        || (0xE000..=0xFFFD).contains(&codepoint)
        || (0x10000..=0x10FFFF).contains(&codepoint))
    {
        return Err("FOMOD XML contains a character forbidden by XML 1.0.".into());
    }
    char::from_u32(codepoint)
        .ok_or_else(|| "FOMOD XML contains an invalid numeric entity reference.".to_string())
}

fn parse_xml(text: &str) -> Result<XmlElement, String> {
    let mut reader = Reader::from_str(text);
    reader.config_mut().trim_text(false);
    let mut stack = Vec::<XmlElement>::new();
    let mut roots = Vec::<XmlElement>::new();
    let mut node_count = 0usize;
    loop {
        match reader.read_event() {
            Ok(Event::Start(event)) => {
                node_count += 1;
                if node_count > MAX_XML_NODES {
                    return Err("FOMOD XML exceeds the maximum element count.".into());
                }
                if stack.len() >= MAX_XML_DEPTH {
                    return Err("FOMOD XML exceeds the maximum nesting depth.".into());
                }
                let mut attributes = HashMap::new();
                for attribute in event.attributes().with_checks(true) {
                    let attribute =
                        attribute.map_err(|error| format!("FOMOD XML attribute: {error}"))?;
                    let key = xml_name(attribute.key.as_ref());
                    if attributes
                        .keys()
                        .any(|existing: &String| existing.eq_ignore_ascii_case(&key))
                    {
                        return Err(format!(
                            "FOMOD XML has ambiguous duplicate attribute `{key}`."
                        ));
                    }
                    let value = attribute
                        .decode_and_unescape_value(reader.decoder())
                        .map_err(|error| format!("FOMOD XML attribute value: {error}"))?
                        .into_owned();
                    attributes.insert(key, value);
                }
                stack.push(XmlElement {
                    name: xml_name(event.name().as_ref()),
                    attributes,
                    children: Vec::new(),
                    content: Vec::new(),
                    text: String::new(),
                });
            }
            Ok(Event::Empty(event)) => {
                node_count += 1;
                if node_count > MAX_XML_NODES {
                    return Err("FOMOD XML exceeds the maximum element count.".into());
                }
                if stack.len() >= MAX_XML_DEPTH {
                    return Err("FOMOD XML exceeds the maximum nesting depth.".into());
                }
                let mut attributes = HashMap::new();
                for attribute in event.attributes().with_checks(true) {
                    let attribute =
                        attribute.map_err(|error| format!("FOMOD XML attribute: {error}"))?;
                    let key = xml_name(attribute.key.as_ref());
                    if attributes
                        .keys()
                        .any(|existing: &String| existing.eq_ignore_ascii_case(&key))
                    {
                        return Err(format!(
                            "FOMOD XML has ambiguous duplicate attribute `{key}`."
                        ));
                    }
                    let value = attribute
                        .decode_and_unescape_value(reader.decoder())
                        .map_err(|error| format!("FOMOD XML attribute value: {error}"))?
                        .into_owned();
                    attributes.insert(key, value);
                }
                push_xml_child(
                    &mut stack,
                    &mut roots,
                    XmlElement {
                        name: xml_name(event.name().as_ref()),
                        attributes,
                        children: Vec::new(),
                        content: Vec::new(),
                        text: String::new(),
                    },
                );
            }
            Ok(Event::Text(event)) => {
                let decoded = event
                    .decode()
                    .map_err(|error| format!("FOMOD XML text: {error}"))?;
                let decoded = quick_xml::escape::unescape(&decoded)
                    .map_err(|error| format!("FOMOD XML entity: {error}"))?;
                if let Some(current) = stack.last_mut() {
                    current.push_text(&decoded);
                } else if !decoded.trim().is_empty() {
                    return Err("FOMOD XML contains text outside its root element.".into());
                }
            }
            Ok(Event::CData(event)) => {
                let decoded = event
                    .decode()
                    .map_err(|error| format!("FOMOD XML text: {error}"))?;
                if let Some(current) = stack.last_mut() {
                    current.push_text(&decoded);
                } else if !decoded.trim().is_empty() {
                    return Err("FOMOD XML contains CDATA outside its root element.".into());
                }
            }
            Ok(Event::End(event)) => {
                let closing_name = xml_name(event.name().as_ref());
                let element = stack
                    .pop()
                    .ok_or_else(|| "FOMOD XML has an unmatched closing tag.".to_string())?;
                if element.name != closing_name {
                    return Err(format!(
                        "FOMOD XML closing tag `{closing_name}` does not match `{}`.",
                        element.name
                    ));
                }
                push_xml_child(&mut stack, &mut roots, element);
            }
            Ok(Event::Eof) => break,
            Ok(Event::DocType(_)) => {
                return Err("FOMOD XML DTD declarations are not supported.".into())
            }
            Ok(Event::Decl(_) | Event::Comment(_) | Event::PI(_)) => {}
            Ok(Event::GeneralRef(event)) => {
                let value = decode_xml_reference(event.as_ref())?;
                if let Some(current) = stack.last_mut() {
                    current.push_text(&value.to_string());
                } else {
                    return Err("FOMOD XML contains an entity outside its root element.".into());
                }
            }
            Err(error) => return Err(format!("Invalid FOMOD XML: {error}")),
        }
    }
    if !stack.is_empty() || roots.len() != 1 {
        return Err("FOMOD XML must contain exactly one complete root element.".into());
    }
    if reader.buffer_position() < text.len() as u64 {
        return Err("FOMOD XML contains unparsed trailing content.".into());
    }
    Ok(roots.remove(0))
}

fn validate_xml_characters(text: &str) -> Result<(), String> {
    if text.chars().any(|character| {
        let codepoint = character as u32;
        !(codepoint == 0x9
            || codepoint == 0xA
            || codepoint == 0xD
            || (0x20..=0xD7FF).contains(&codepoint)
            || (0xE000..=0xFFFD).contains(&codepoint)
            || (0x10000..=0x10FFFF).contains(&codepoint))
    }) {
        return Err("FOMOD XML contains a character forbidden by XML 1.0.".into());
    }
    Ok(())
}

fn decode_xml(bytes: &[u8]) -> Result<String, String> {
    if bytes.starts_with(&[0xFF, 0xFE]) || bytes.starts_with(&[0xFE, 0xFF]) {
        let little_endian = bytes.starts_with(&[0xFF, 0xFE]);
        let payload = &bytes[2..];
        if payload.len() % 2 != 0 {
            return Err("FOMOD UTF-16 XML has an incomplete code unit.".into());
        }
        let units = payload
            .chunks_exact(2)
            .map(|pair| {
                if little_endian {
                    u16::from_le_bytes([pair[0], pair[1]])
                } else {
                    u16::from_be_bytes([pair[0], pair[1]])
                }
            })
            .collect::<Vec<_>>();
        let decoded = String::from_utf16(&units)
            .map_err(|error| format!("FOMOD UTF-16 XML is invalid: {error}"))?;
        validate_xml_characters(&decoded)?;
        return Ok(decoded);
    }
    let payload = bytes.strip_prefix(&[0xEF, 0xBB, 0xBF]).unwrap_or(bytes);
    let decoded = String::from_utf8(payload.to_vec())
        .map_err(|error| format!("FOMOD XML is not valid UTF-8: {error}"))?;
    validate_xml_characters(&decoded)?;
    Ok(decoded)
}

fn archive_path_key(value: &str) -> String {
    value
        .chars()
        .flat_map(char::to_uppercase)
        .flat_map(char::to_lowercase)
        .collect()
}

fn normalize_archive_path(value: &str) -> Result<String, String> {
    if value.len() > MAX_ARCHIVE_PATH_BYTES {
        return Err(format!(
            "FOMOD path exceeds the {MAX_ARCHIVE_PATH_BYTES}-byte limit."
        ));
    }
    let normalized = value.replace('\\', "/");
    if normalized.trim() != normalized.as_str() {
        return Err(format!(
            "FOMOD path has ambiguous leading or trailing whitespace: {value}"
        ));
    }
    if normalized.is_empty()
        || normalized.starts_with('/')
        || normalized.starts_with("//")
        || normalized.contains(':')
        || normalized.chars().any(char::is_control)
        || normalized
            .chars()
            .any(|character| matches!(character, '<' | '>' | '"' | '|' | '?' | '*'))
    {
        return Err(format!("Unsafe or empty FOMOD path: {value}"));
    }
    let mut parts = Vec::new();
    for part in normalized.split('/') {
        match part {
            "" | "." => {}
            ".." => return Err(format!("FOMOD path traversal is not allowed: {value}")),
            segment => {
                if segment.ends_with('.') || segment.ends_with(' ') {
                    return Err(format!(
                        "FOMOD path has a Windows-ambiguous trailing dot or space: {value}"
                    ));
                }
                let device_name = segment
                    .split('.')
                    .next()
                    .unwrap_or_default()
                    .trim_end_matches(|character| character == ' ' || character == '.')
                    .to_ascii_uppercase();
                let reserved_device = matches!(
                    device_name.as_str(),
                    "CON" | "PRN" | "AUX" | "NUL" | "CONIN$" | "CONOUT$"
                ) || ["COM", "LPT"].iter().any(|prefix| {
                    device_name.strip_prefix(prefix).is_some_and(|suffix| {
                        matches!(
                            suffix,
                            "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "¹" | "²" | "³"
                        )
                    })
                });
                if reserved_device {
                    return Err(format!(
                        "FOMOD path contains a reserved Windows device name: {value}"
                    ));
                }
                parts.push(segment);
            }
        }
    }
    if parts.is_empty() {
        return Err(format!("FOMOD path has no usable components: {value}"));
    }
    Ok(parts.join("/"))
}

fn archive_entries(
    archive: &mut ZipArchive<File>,
) -> Result<(Vec<ArchiveEntry>, HashMap<String, usize>), String> {
    if archive.len() > MAX_ARCHIVE_ENTRIES {
        return Err("FOMOD archive contains too many entries.".into());
    }
    let mut entries = Vec::with_capacity(archive.len());
    let mut lookup = HashMap::with_capacity(archive.len());
    let mut seen_paths = HashMap::<String, bool>::new();
    let mut paths_with_children = HashSet::new();
    let mut total_bytes = 0u64;
    let mut total_path_bytes = 0usize;
    for index in 0..archive.len() {
        let entry = archive
            .by_index(index)
            .map_err(|error| format!("Cannot inspect ZIP entry: {error}"))?;
        if super::archive_is_symlink(entry.unix_mode()) {
            return Err("FOMOD archive contains a symbolic link.".into());
        }
        let raw_path_bytes = entry.name_raw().len();
        if raw_path_bytes > MAX_ARCHIVE_PATH_BYTES {
            return Err(format!(
                "FOMOD ZIP path exceeds the {MAX_ARCHIVE_PATH_BYTES}-byte limit."
            ));
        }
        total_path_bytes = total_path_bytes.saturating_add(raw_path_bytes);
        if total_path_bytes > MAX_ARCHIVE_PATHS_BYTES {
            return Err("FOMOD archive contains too much path metadata.".into());
        }
        let enclosed = entry
            .enclosed_name()
            .ok_or_else(|| "FOMOD archive contains an unsafe ZIP path.".to_string())?;
        let enclosed = enclosed
            .to_str()
            .ok_or_else(|| "FOMOD archive contains a non-UTF-8 path.".to_string())?;
        let path = normalize_archive_path(enclosed)?;
        super::validate_archive_relative(Path::new(&path))?;
        total_bytes = total_bytes.saturating_add(entry.size());
        if total_bytes > MAX_ARCHIVE_UNPACKED_BYTES {
            return Err("FOMOD archive exceeds the 4 GB expanded-size limit.".into());
        }
        let key = archive_path_key(&path);
        let is_dir = entry.is_dir();
        if seen_paths.contains_key(&key) {
            return Err(format!(
                "FOMOD archive has duplicate case-insensitive paths: {path}"
            ));
        }
        let mut parent = Path::new(&key).parent();
        while let Some(parent_path) = parent {
            if parent_path.as_os_str().is_empty() {
                break;
            }
            let parent_key = archive_path_key(&parent_path.to_string_lossy());
            if seen_paths.get(&parent_key) == Some(&false) {
                return Err(format!(
                    "FOMOD archive uses a file as a parent path: {}",
                    parent_path.display()
                ));
            }
            parent = parent_path.parent();
        }
        if !is_dir && paths_with_children.contains(&key) {
            return Err(format!(
                "FOMOD archive uses a file as a parent path: {path}"
            ));
        }
        let mut ancestor = Path::new(&key).parent();
        while let Some(parent_path) = ancestor {
            if parent_path.as_os_str().is_empty() {
                break;
            }
            paths_with_children.insert(archive_path_key(&parent_path.to_string_lossy()));
            ancestor = parent_path.parent();
        }
        seen_paths.insert(key.clone(), is_dir);
        lookup.insert(key, index);
        entries.push(ArchiveEntry {
            path,
            index,
            is_dir,
            size: entry.size(),
        });
    }
    Ok((entries, lookup))
}

fn read_entry(archive: &mut ZipArchive<File>, index: usize, limit: u64) -> Result<Vec<u8>, String> {
    let mut entry = archive
        .by_index(index)
        .map_err(|error| format!("Cannot read ZIP entry: {error}"))?;
    if entry.size() > limit {
        return Err("FOMOD metadata or image exceeds its read limit.".into());
    }
    let mut bytes = Vec::with_capacity(entry.size() as usize);
    entry
        .take(limit + 1)
        .read_to_end(&mut bytes)
        .map_err(|error| format!("Cannot read ZIP entry: {error}"))?;
    if bytes.len() as u64 > limit {
        return Err("FOMOD metadata or image exceeds its read limit.".into());
    }
    Ok(bytes)
}

fn has_fomod_member(config_path: &str, member_name: &str) -> bool {
    let mut components = config_path
        .rsplit('/')
        .filter(|component| !component.is_empty());
    components
        .next()
        .is_some_and(|name| name.eq_ignore_ascii_case(member_name))
        && components
            .next()
            .is_some_and(|parent| parent.eq_ignore_ascii_case("fomod"))
}

fn archive_prefix(config_path: &str) -> String {
    let components = config_path
        .split('/')
        .filter(|component| !component.is_empty())
        .collect::<Vec<_>>();
    components
        .get(..components.len().saturating_sub(2))
        .map(|prefix| prefix.join("/"))
        .unwrap_or_default()
}

fn config_directory(config_path: &str) -> String {
    config_path
        .rsplit_once('/')
        .map(|(parent, _)| parent.to_string())
        .unwrap_or_default()
}

fn strip_prefix_case_insensitive<'a>(path: &'a str, prefix: &str) -> Option<&'a str> {
    let prefix_parts = prefix.split('/').collect::<Vec<_>>();
    let mut path_parts = path.split('/');
    for expected in &prefix_parts {
        let actual = path_parts.next()?;
        if archive_path_key(actual) != archive_path_key(expected) {
            return None;
        }
    }
    let prefix_component_count = prefix_parts.len();
    path.splitn(prefix_component_count + 1, '/')
        .nth(prefix_component_count)
}

fn find_member(
    source: &str,
    prefix: &str,
    config_dir: &str,
    lookup: &HashMap<String, usize>,
) -> Result<Option<usize>, String> {
    let source = normalize_archive_path(source)?;
    let mut candidates = vec![source.clone()];
    if !prefix.is_empty() {
        candidates.push(format!("{prefix}/{source}"));
    }
    if !config_dir.is_empty() {
        candidates.push(format!("{config_dir}/{source}"));
    }
    candidates.sort_by_key(|candidate| archive_path_key(candidate));
    candidates.dedup_by(|left, right| archive_path_key(left) == archive_path_key(right));
    let matches = candidates
        .iter()
        .filter_map(|candidate| lookup.get(&archive_path_key(candidate)).copied())
        .collect::<HashSet<_>>();
    if matches.len() > 1 {
        return Err(format!(
            "FOMOD source `{source}` resolves to multiple archive entries."
        ));
    }
    Ok(matches.into_iter().next())
}

fn optional_metadata(info: Option<&XmlElement>, key: &str) -> Option<String> {
    info?
        .child(key)
        .map(XmlElement::text_content)
        .filter(|value| !value.is_empty())
}

fn add_warning(warnings: &mut Vec<String>, value: impl Into<String>) {
    if warnings.len() >= MAX_FOMOD_WARNINGS
        || warnings.iter().any(|warning| {
            warning == "Trop d’avertissements FOMOD pour détailler les règles non prises en charge."
        })
    {
        return;
    }
    let value = value.into();
    if warnings.contains(&value) {
        return;
    }
    if warnings.len() == MAX_FOMOD_WARNINGS - 1 {
        warnings.push(
            "Trop d’avertissements FOMOD pour détailler les règles non prises en charge.".into(),
        );
    } else {
        warnings.push(value);
    }
}

fn destinations_overlap(left: &str, right: &str) -> bool {
    let left = archive_path_key(left);
    let right = archive_path_key(right);
    left == right
        || left.starts_with(&format!("{right}/"))
        || right.starts_with(&format!("{left}/"))
}

fn inspect_xml_structure(element: &XmlElement, warnings: &mut Vec<String>) {
    let known_elements = [
        "config",
        "moduleName",
        "moduleImage",
        "moduleDependencies",
        "requiredInstallFiles",
        "installSteps",
        "installStep",
        "visible",
        "optionalFileGroups",
        "group",
        "plugins",
        "plugin",
        "description",
        "image",
        "typeDescriptor",
        "type",
        "dependencyType",
        "defaultType",
        "dependencies",
        "fileDependency",
        "flagDependency",
        "versionDependency",
        "gameDependency",
        "conditionFlags",
        "flag",
        "pattern",
        "patterns",
        "conditionalFileInstalls",
        "files",
        "file",
        "folder",
        "scriptType",
    ];
    if !known_elements.contains(&element.name.as_str()) {
        add_warning(
            warnings,
            format!(
                "L’élément XML FOMOD `<{}>` n’est pas reconnu et n’est pas interprété.",
                element.name
            ),
        );
    }

    let allowed_attributes: &[&str] = match element.name.as_str() {
        "config" => &[
            "moduleName",
            "colour",
            "position",
            "xmlns",
            "xmlns:xsi",
            "xsi:noNamespaceSchemaLocation",
        ],
        "installSteps" | "optionalFileGroups" | "plugins" | "requiredInstallFiles" | "files" => {
            &["order"]
        }
        "installStep" => &["name"],
        "group" => &["name", "type"],
        "plugin" => &["name", "type"],
        "type" | "defaultType" => &["name"],
        "file" | "folder" => &[
            "source",
            "destination",
            "priority",
            "alwaysInstall",
            "installIfUsable",
        ],
        "moduleImage" => &["path", "showImage", "showFade", "height"],
        "image" => &["path"],
        "dependencies" | "moduleDependencies" => &["operator"],
        "fileDependency" => &["file", "state"],
        "flagDependency" => &["flag", "value"],
        "versionDependency" => &["file", "version", "operator"],
        "gameDependency" => &["version"],
        "flag" => &["name"],
        _ => &[],
    };
    for attribute in element.attributes.keys() {
        if !allowed_attributes.contains(&attribute.as_str()) {
            add_warning(
                warnings,
                format!(
                    "L’attribut FOMOD `{attribute}` sur `<{}>` n’est pas interprété.",
                    element.name
                ),
            );
        }
    }

    let singleton_children: &[&str] = match element.name.to_ascii_lowercase().as_str() {
        "config" => &[
            "moduleName",
            "moduleImage",
            "moduleDependencies",
            "requiredInstallFiles",
            "installSteps",
            "conditionalFileInstalls",
        ],
        "installstep" => &["visible", "optionalFileGroups"],
        "group" => &["plugins", "dependencies", "visible"],
        "plugin" => &["description", "image", "typeDescriptor", "files"],
        "typedescriptor" => &["type", "dependencyType"],
        "dependencytype" => &["defaultType", "dependencies"],
        _ => &[],
    };
    for child_name in singleton_children {
        if element.children_named(child_name).count() > 1 {
            add_warning(warnings, format!("L’élément `<{child_name}>` apparaît plusieurs fois dans `<{}>`; sa sémantique est ambiguë.", element.name));
        }
    }

    let allowed_children: &[&str] = match element.name.as_str() {
        "config" => &[
            "moduleName",
            "requiredInstallFiles",
            "installSteps",
            "moduleDependencies",
            "moduleImage",
            "conditionalFileInstalls",
        ],
        "requiredInstallFiles" | "files" => &["file", "folder"],
        "installSteps" => &["installStep"],
        "installStep" => &["visible", "optionalFileGroups"],
        "optionalFileGroups" => &["group"],
        "group" => &["plugins", "dependencies", "visible"],
        "plugins" => &["plugin"],
        "plugin" => &[
            "description",
            "image",
            "typeDescriptor",
            "files",
            "conditionFlags",
        ],
        "typeDescriptor" => &["type", "dependencyType"],
        "dependencyType" => &["defaultType", "patterns"],
        "moduleDependencies" | "visible" => &[
            "dependencies",
            "fileDependency",
            "flagDependency",
            "versionDependency",
            "gameDependency",
        ],
        "conditionalFileInstalls" => &["patterns"],
        "patterns" => &["pattern"],
        "pattern" => &["dependencies", "files", "type"],
        "dependencies" => &[
            "dependencies",
            "fileDependency",
            "flagDependency",
            "versionDependency",
            "gameDependency",
        ],
        "fileDependency" | "flagDependency" | "versionDependency" | "gameDependency" => &[],
        "conditionFlags" => &["flag"],
        "flag" => &[],
        _ => &[],
    };
    if !matches!(
        element.name.as_str(),
        "moduleName" | "description" | "scriptType"
    ) && !element.text.trim().is_empty()
    {
        add_warning(
            warnings,
            format!(
                "Le texte libre dans `<{}>` n’est pas interprété.",
                element.name
            ),
        );
    }
    for child in &element.children {
        if !allowed_children.contains(&child.name.as_str()) {
            add_warning(
                warnings,
                format!(
                    "L’élément `<{}>` n’est pas valide dans `<{}>` ou n’est pas interprété.",
                    child.name, element.name
                ),
            );
        }
        inspect_xml_structure(child, warnings);
    }
}

fn inspect_unsupported_features(
    root: &XmlElement,
    entries: &[ArchiveEntry],
    warnings: &mut Vec<String>,
) {
    inspect_xml_structure(root, warnings);
    for tag in [
        "installSteps",
        "optionalFileGroups",
        "plugins",
        "requiredInstallFiles",
        "files",
    ] {
        if root.descendants(tag).iter().any(|element| {
            element
                .attribute("order")
                .is_some_and(|order| !order.eq_ignore_ascii_case("Explicit"))
        }) {
            add_warning(
                warnings,
                format!(
                    "L’ordre FOMOD de `{tag}` n’est pas `Explicit` et n’est pas pris en charge."
                ),
            );
        }
    }
    let conditional_tags = [
        "fileDependency",
        "flagDependency",
        "versionDependency",
        "gameDependency",
        "dependencies",
        "dependencyType",
        "defaultType",
        "conditionalFileInstalls",
        "conditionFlags",
        "moduleDependencies",
        "visible",
        "pattern",
    ];
    for tag in conditional_tags {
        if !root.descendants(tag).is_empty() {
            add_warning(
                warnings,
                format!(
                    "La règle FOMOD `{tag}` est conditionnelle et n’est pas encore interprétée."
                ),
            );
        }
    }
    if root.child("scriptType").is_some() || !root.descendants("scriptType").is_empty() {
        add_warning(
            warnings,
            "L’installateur déclare un type de script FOMOD non pris en charge.".to_string(),
        );
    }
    if root.child("conditionalFileInstalls").is_some() {
        add_warning(warnings, "Le FOMOD contient des installations post-sélection conditionnelles (`conditionalFileInstalls`), qui ne sont pas prises en charge.".to_string());
    }
    if root.child("requiredInstallFiles").is_none() && root.child("installSteps").is_none() {
        if root.child("conditionalFileInstalls").is_none() {
            add_warning(
                warnings,
                "Le FOMOD ne déclare aucune étape ni aucun fichier d’installation.".to_string(),
            );
        } else {
            add_warning(
                warnings,
                "Le FOMOD ne déclare que des installations conditionnelles non prises en charge."
                    .to_string(),
            );
        }
    }
    if root.child("requiredInstallFiles").is_some_and(|container| {
        container.children_named("file").next().is_none()
            && container.children_named("folder").next().is_none()
    }) {
        add_warning(
            warnings,
            "Le FOMOD déclare un conteneur de fichiers obligatoires vide.".to_string(),
        );
    }
    if root.child("installSteps").is_some() && root.descendants("installStep").is_empty() {
        add_warning(
            warnings,
            "Le FOMOD ne contient aucune étape d’installation interprétable.".to_string(),
        );
    }
    if root.descendants("installStep").iter().any(|step| {
        step.child("optionalFileGroups").map_or(true, |groups| {
            groups.children_named("group").next().is_none()
        })
    }) {
        add_warning(
            warnings,
            "Une étape FOMOD ne contient aucun groupe d’options interprétable.".to_string(),
        );
    }
    if root.descendants("group").iter().any(|group| {
        group.child("plugins").map_or(true, |plugins| {
            plugins.children_named("plugin").next().is_none()
        })
    }) {
        add_warning(
            warnings,
            "Un groupe FOMOD ne contient aucune option explicite.".to_string(),
        );
    }
    if root.descendants("group").iter().any(|group| {
        group
            .attribute("type")
            .map_or(true, |kind| !selection_type_supported(kind))
    }) {
        add_warning(
            warnings,
            "Un groupe FOMOD ne déclare pas explicitement son type de sélection.".to_string(),
        );
    }
    if root.descendants("group").iter().any(|group| {
        let Some(kind) = group.attribute("type") else {
            return false;
        };
        let options = group
            .child("plugins")
            .map(|plugins| plugins.children_named("plugin").collect::<Vec<_>>())
            .unwrap_or_default();
        let required = options
            .iter()
            .filter(|plugin| option_flags(option_kind(plugin)).0)
            .count();
        let selectable = options
            .iter()
            .filter(|plugin| option_flags(option_kind(plugin)).2)
            .count();
        match kind.to_ascii_lowercase().as_str() {
            "selectatmostone" => required > 1,
            "selectexactlyone" | "selectone" => required > 1 || selectable == 0,
            "selectatleastone" => selectable == 0,
            "selectall" => false,
            _ => false,
        }
    }) {
        add_warning(
            warnings,
            "Un groupe FOMOD a des contraintes de sélection statiquement impossibles.".to_string(),
        );
    }
    if root.descendants("plugin").iter().any(|plugin| {
        plugin.attribute("type").is_none() && plugin.child("typeDescriptor").is_none()
    }) {
        add_warning(
            warnings,
            "Une option FOMOD ne déclare pas explicitement son type.".to_string(),
        );
    }
    if root.descendants("plugin").iter().any(|plugin| {
        option_kind(plugin).eq_ignore_ascii_case("CouldBeUsable")
            || plugin
                .child("typeDescriptor")
                .is_some_and(|descriptor| descriptor.child("dependencyType").is_some())
    }) {
        add_warning(
            warnings,
            "Un type de sélection FOMOD dépendant de l’état ou d’une condition est présent."
                .to_string(),
        );
    }
    if root.descendants("plugin").iter().any(|plugin| {
        plugin.attribute("type").is_some() && plugin.child("typeDescriptor").is_some()
    }) {
        add_warning(
            warnings,
            "Une option FOMOD déclare deux sources de type contradictoires ou ambiguës."
                .to_string(),
        );
    }
    if root.descendants("plugin").iter().any(|plugin| {
        plugin.child("typeDescriptor").is_some_and(|descriptor| {
            descriptor
                .child("type")
                .and_then(|kind| kind.attribute("name"))
                .map_or(true, str::is_empty)
        })
    }) {
        add_warning(
            warnings,
            "Un typeDescriptor FOMOD ne contient pas de type statique interprétable.".to_string(),
        );
    }
    if root
        .descendants("plugin")
        .iter()
        .any(|plugin| plugin.attribute("name").map_or(true, str::is_empty))
    {
        add_warning(
            warnings,
            "Une option FOMOD ne déclare pas de nom explicite.".to_string(),
        );
    }
    if root
        .descendants("installStep")
        .iter()
        .any(|step| step.attribute("name").map_or(true, str::is_empty))
        || root
            .descendants("group")
            .iter()
            .any(|group| group.attribute("name").map_or(true, str::is_empty))
    {
        add_warning(
            warnings,
            "Une étape ou un groupe FOMOD ne déclare pas de nom explicite.".to_string(),
        );
    }
    if root
        .descendants("file")
        .iter()
        .any(|element| element.attribute("alwaysInstall").is_some())
        || root
            .descendants("folder")
            .iter()
            .any(|element| element.attribute("alwaysInstall").is_some())
    {
        add_warning(warnings, "Des règles FOMOD utilisent `alwaysInstall`; cette sémantique ne peut pas être déterminée statiquement.".to_string());
    }
    if root
        .descendants("file")
        .iter()
        .any(|element| element.attribute("installIfUsable").is_some())
        || root
            .descendants("folder")
            .iter()
            .any(|element| element.attribute("installIfUsable").is_some())
    {
        add_warning(warnings, "Des fichiers FOMOD utilisent `installIfUsable`; cette condition n’est pas encore interprétée.".to_string());
    }
    if entries.iter().any(|entry| {
        let path = archive_path_key(&entry.path);
        path == "fomod/scripts"
            || path.ends_with("/fomod/scripts")
            || path.contains("/fomod/scripts/")
            || path.starts_with("fomod/scripts/")
    }) {
        add_warning(
            warnings,
            "Un dossier `fomod/scripts` est présent ; aucun script ne sera exécuté.".to_string(),
        );
    }
}

fn rules_from_container(
    container: Option<&XmlElement>,
    warnings: &mut Vec<String>,
) -> Vec<FomodFileRule> {
    let Some(container) = container else {
        return Vec::new();
    };
    container
        .children
        .iter()
        .filter_map(|element| {
            let folder = if element.name.eq_ignore_ascii_case("folder") {
                true
            } else if element.name.eq_ignore_ascii_case("file") {
                false
            } else {
                add_warning(
                    warnings,
                    format!(
                        "Une structure de fichier FOMOD `<{}>` n’est pas prise en charge.",
                        element.name
                    ),
                );
                return None;
            };
            let Some(source) = element.attribute("source") else {
                add_warning(
                    warnings,
                    "Une règle FOMOD sans attribut `source` a été ignorée.".to_string(),
                );
                return None;
            };
            let source = match normalize_archive_path(source) {
                Ok(value) => value,
                Err(error) => {
                    add_warning(warnings, error);
                    return None;
                }
            };
            let destination = element
                .attribute("destination")
                .filter(|value| !value.is_empty())
                .and_then(|value| {
                    normalize_archive_path(value)
                        .map(Some)
                        .unwrap_or_else(|error| {
                            add_warning(warnings, error);
                            None
                        })
                });
            let priority = element
                .attribute("priority")
                .map(str::parse::<i64>)
                .transpose()
                .unwrap_or_else(|_| {
                    add_warning(warnings, "Une priorité FOMOD est invalide.".to_string());
                    None
                })
                .unwrap_or(0);
            Some(FomodFileRule {
                source,
                destination,
                folder,
                priority,
            })
        })
        .collect()
}

fn image_data_url(
    path: Option<&str>,
    prefix: &str,
    config_dir: &str,
    archive: &mut ZipArchive<File>,
    lookup: &HashMap<String, usize>,
    used_bytes: &mut u64,
) -> Option<String> {
    let raw = path?.trim();
    if raw.is_empty() {
        return None;
    }
    let normalized = normalize_archive_path(raw).ok()?;
    let candidates = if normalized.to_ascii_lowercase().starts_with("fomod/") {
        vec![
            normalized.clone(),
            if prefix.is_empty() {
                normalized
            } else {
                format!("{prefix}/{normalized}")
            },
        ]
    } else {
        vec![
            format!("{config_dir}/{normalized}"),
            if prefix.is_empty() {
                normalized
            } else {
                format!("{prefix}/{normalized}")
            },
        ]
    };
    let indexes = candidates
        .iter()
        .filter_map(|candidate| lookup.get(&archive_path_key(candidate)).copied())
        .collect::<HashSet<_>>();
    if indexes.len() != 1 {
        return None;
    }
    let index = *indexes.iter().next()?;
    let ext = Path::new(
        &candidates
            .iter()
            .find(|candidate| lookup.get(&archive_path_key(candidate)) == Some(&index))?,
    )
    .extension()?
    .to_str()?
    .to_ascii_lowercase();
    let mime = match ext.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "gif" => "image/gif",
        _ => return None,
    };
    let remaining = MAX_PLAN_IMAGE_BYTES.saturating_sub(*used_bytes);
    if remaining == 0 {
        return None;
    }
    if archive.by_index(index).ok()?.is_dir() {
        return None;
    }
    let bytes = read_entry(archive, index, MAX_IMAGE_BYTES.min(remaining)).ok()?;
    *used_bytes = used_bytes.saturating_add(bytes.len() as u64);
    Some(format!("data:{mime};base64,{}", BASE64.encode(bytes)))
}

fn option_kind(plugin: &XmlElement) -> &str {
    plugin
        .child("typeDescriptor")
        .and_then(|descriptor| descriptor.child("type"))
        .and_then(|kind| kind.attribute("name"))
        .or_else(|| plugin.attribute("type"))
        .unwrap_or("Optional")
}

fn option_type(plugin: &XmlElement, warnings: &mut Vec<String>) -> String {
    let kind = option_kind(plugin);
    if plugin
        .child("typeDescriptor")
        .is_some_and(|descriptor| descriptor.child("dependencyType").is_some())
        || kind.eq_ignore_ascii_case("CouldBeUsable")
    {
        add_warning(
            warnings,
            "Un type de sélection FOMOD dépendant de l’état ou d’une condition est présent."
                .to_string(),
        );
    }
    kind.to_string()
}

fn option_flags(kind: &str) -> (bool, bool, bool) {
    match kind.to_ascii_lowercase().as_str() {
        "required" => (true, true, true),
        "recommended" => (false, true, true),
        "optional" => (false, false, true),
        "couldbeusable" | "notusable" => (false, false, false),
        _ => (false, false, false),
    }
}

fn selection_type_supported(value: &str) -> bool {
    matches!(
        value.to_ascii_lowercase().as_str(),
        "selectall"
            | "selectany"
            | "selectatleastone"
            | "selectatmostone"
            | "selectexactlyone"
            | "selectone"
    )
}

fn preview_target(rule: &FomodFileRule) -> String {
    let path = rule
        .destination
        .as_deref()
        .and_then(|value| super::cyberpunk_map_file(Path::new(value)));
    path.map(|path| {
        let mut components = path.components();
        let mut target = PathBuf::new();
        for _ in 0..3 {
            if let Some(component) = components.next() {
                target.push(component.as_os_str());
            }
        }
        target.to_string_lossy().replace('\\', "/")
    })
    .unwrap_or_else(|| "racine à vérifier".to_string())
}

fn build_plan(
    module: &XmlElement,
    info: Option<&XmlElement>,
    config_path: &str,
    entries: &[ArchiveEntry],
    archive: &mut ZipArchive<File>,
    lookup: &HashMap<String, usize>,
    fallback_name: &str,
) -> FomodArchivePlan {
    let prefix = archive_prefix(config_path);
    let config_dir = config_directory(config_path);
    let mut warnings = Vec::new();
    inspect_unsupported_features(module, entries, &mut warnings);
    let required_files = rules_from_container(module.child("requiredInstallFiles"), &mut warnings);
    let mut steps = Vec::new();
    let mut image_bytes = 0u64;
    if let Some(install_steps) = module.child("installSteps") {
        for (step_index, step_element) in install_steps.children_named("installStep").enumerate() {
            let step_id = format!("step-{step_index}");
            let mut groups = Vec::new();
            if let Some(groups_element) = step_element.child("optionalFileGroups") {
                for (group_index, group_element) in
                    groups_element.children_named("group").enumerate()
                {
                    let group_id = format!("{step_id}-group-{group_index}");
                    let selection_type = group_element
                        .attribute("type")
                        .unwrap_or("SelectAny")
                        .to_string();
                    if !selection_type_supported(&selection_type) {
                        add_warning(
                            &mut warnings,
                            format!(
                                "Le type de groupe `{selection_type}` n’est pas pris en charge."
                            ),
                        );
                    }
                    let mut options = Vec::new();
                    if let Some(plugins) = group_element.child("plugins") {
                        for (option_index, plugin) in plugins.children_named("plugin").enumerate() {
                            let id = format!("{group_id}-option-{option_index}");
                            let kind = option_type(plugin, &mut warnings);
                            let (required, selected_by_default, selectable) = option_flags(&kind);
                            if !matches!(
                                kind.to_ascii_lowercase().as_str(),
                                "required"
                                    | "recommended"
                                    | "optional"
                                    | "couldbeusable"
                                    | "notusable"
                            ) {
                                add_warning(
                                    &mut warnings,
                                    format!(
                                        "Le type d’option FOMOD `{kind}` n’est pas pris en charge."
                                    ),
                                );
                            }
                            let files = rules_from_container(plugin.child("files"), &mut warnings);
                            let mut targets = files.iter().map(preview_target).collect::<Vec<_>>();
                            targets.sort();
                            targets.dedup();
                            let image_path = plugin
                                .child("image")
                                .and_then(|image| image.attribute("path"));
                            let image_data_url = image_data_url(
                                image_path,
                                &prefix,
                                &config_dir,
                                archive,
                                lookup,
                                &mut image_bytes,
                            );
                            options.push(FomodOption {
                                id,
                                name: plugin.attribute("name").unwrap_or("Option").to_string(),
                                description: plugin
                                    .child("description")
                                    .map(XmlElement::text_content)
                                    .filter(|value| !value.is_empty()),
                                image_data_url,
                                required,
                                selectable,
                                selected_by_default,
                                file_count: files.len(),
                                targets,
                                files,
                            });
                        }
                    }
                    if selection_type.eq_ignore_ascii_case("SelectAll") {
                        for option in &mut options {
                            if option.selectable {
                                option.selected_by_default = true;
                            }
                        }
                    }
                    groups.push(FomodGroup {
                        id: group_id,
                        name: group_element
                            .attribute("name")
                            .unwrap_or("Options")
                            .to_string(),
                        selection_type,
                        options,
                    });
                }
            }
            steps.push(FomodStep {
                id: step_id,
                name: step_element
                    .attribute("name")
                    .unwrap_or("Installation")
                    .to_string(),
                groups,
            });
        }
    }

    let name = optional_metadata(info, "Name")
        .or_else(|| {
            module
                .child("moduleName")
                .map(XmlElement::text_content)
                .filter(|value| !value.is_empty())
        })
        .or_else(|| module.attribute("moduleName").map(ToOwned::to_owned))
        .unwrap_or_else(|| fallback_name.to_string());
    let author = optional_metadata(info, "Author");
    let version = optional_metadata(info, "Version");
    let file_rule_count = required_files.len()
        + steps
            .iter()
            .flat_map(|step| &step.groups)
            .flat_map(|group| &group.options)
            .map(|option| option.files.len())
            .sum::<usize>();
    let folder_rule_count = required_files.iter().filter(|rule| rule.folder).count()
        + steps
            .iter()
            .flat_map(|step| &step.groups)
            .flat_map(|group| &group.options)
            .flat_map(|option| &option.files)
            .filter(|rule| rule.folder)
            .count();
    if file_rule_count > MAX_FOMOD_FILE_RULES || folder_rule_count > MAX_FOMOD_FOLDER_RULES {
        add_warning(
            &mut warnings,
            format!(
                "Ce FOMOD dépasse les limites d’analyse ({MAX_FOMOD_FILE_RULES} règles de fichiers ou {MAX_FOMOD_FOLDER_RULES} règles de dossiers) ; le plan est bloqué sans extraction partielle."
            ),
        );
        return FomodArchivePlan {
            name,
            author,
            version,
            support_status: "unsupported".into(),
            required_file_count: required_files.len(),
            archive_fingerprint: String::new(),
            steps,
            warnings,
            required_files,
        };
    }

    const MAX_COLLISION_CHECKS: usize = 1_000_000;
    let mut collision_checks = 0usize;
    let required_resolved = required_files
        .iter()
        .map(|rule| resolve_rule(rule, entries, &prefix, &config_dir, lookup));
    let mut required_targets: HashSet<String> = HashSet::new();
    'required_collisions: for resolved in required_resolved {
        match resolved {
            Ok(files) => {
                for file in files {
                    let target =
                        archive_path_key(&file.target.to_string_lossy().replace('\\', "/"));
                    for existing in &required_targets {
                        collision_checks += 1;
                        if collision_checks > MAX_COLLISION_CHECKS {
                            add_warning(&mut warnings, "Le FOMOD dépasse la limite d’analyse des collisions; le plan est bloqué plutôt que partiellement vérifié.".to_string());
                            break 'required_collisions;
                        }
                        if destinations_overlap(&target, existing) {
                            add_warning(&mut warnings, format!("Les règles obligatoires FOMOD produisent une collision de destination ambiguë à `{target}`."));
                        }
                    }
                    required_targets.insert(target);
                }
            }
            Err(error) => add_warning(&mut warnings, error),
        }
    }
    let option_targets = steps
        .iter()
        .flat_map(|step| step.groups.iter())
        .flat_map(|group| group.options.iter())
        .map(|option| {
            option
                .files
                .iter()
                .map(|rule| resolve_rule(rule, entries, &prefix, &config_dir, lookup))
                .collect::<Vec<_>>()
        })
        .collect::<Vec<_>>();
    for targets in &option_targets {
        for resolved in targets {
            if let Err(error) = resolved {
                add_warning(&mut warnings, error.clone());
            }
        }
    }
    if option_targets
        .iter()
        .flatten()
        .any(|resolved| resolved.is_err())
    {
        add_warning(&mut warnings, "Certaines règles de fichiers d’options n’ont pas pu être entièrement résolues; toutes les collisions ne peuvent donc pas être confirmées.".to_string());
    }
    let mut option_owners = Vec::new();
    let mut option_index = 0usize;
    for step in &steps {
        for group in &step.groups {
            for option in &group.options {
                let files = option_targets[option_index]
                    .iter()
                    .filter_map(|resolved| resolved.as_ref().ok())
                    .flatten()
                    .collect::<Vec<_>>();
                if !files.is_empty() {
                    option_owners.push((group, option, files));
                }
                option_index += 1;
            }
        }
    }
    'collision_check: for (left_index, (left_group, left_option, left_files)) in
        option_owners.iter().enumerate()
    {
        if !left_option.selectable {
            continue;
        }
        for file in left_files {
            let target = archive_path_key(&file.target.to_string_lossy().replace('\\', "/"));
            for required in &required_targets {
                collision_checks += 1;
                if collision_checks > MAX_COLLISION_CHECKS {
                    add_warning(&mut warnings, "Le FOMOD dépasse la limite d’analyse des collisions; le plan est bloqué plutôt que partiellement vérifié.".to_string());
                    break 'collision_check;
                }
                if destinations_overlap(&target, required) {
                    add_warning(
                        &mut warnings,
                        format!(
                            "L’option FOMOD `{}` chevauche un fichier obligatoire à `{target}`.",
                            left_option.name
                        ),
                    );
                }
            }
        }
        for (right_index, (right_group, right_option, right_files)) in
            option_owners.iter().enumerate().skip(left_index)
        {
            if !right_option.selectable {
                continue;
            }
            collision_checks += 1;
            if collision_checks > MAX_COLLISION_CHECKS {
                add_warning(&mut warnings, "Le FOMOD dépasse la limite d’analyse des collisions; le plan est bloqué plutôt que partiellement vérifié.".to_string());
                break 'collision_check;
            }
            if left_index != right_index
                && left_group.id == right_group.id
                && matches!(
                    left_group.selection_type.to_ascii_lowercase().as_str(),
                    "selectexactlyone" | "selectone" | "selectatmostone"
                )
            {
                continue;
            }
            for (file_index, left) in left_files.iter().enumerate() {
                let target = archive_path_key(&left.target.to_string_lossy().replace('\\', "/"));
                let right_start = if left_index == right_index {
                    file_index + 1
                } else {
                    0
                };
                for right in right_files.iter().skip(right_start) {
                    collision_checks += 1;
                    if collision_checks > MAX_COLLISION_CHECKS {
                        add_warning(&mut warnings, "Le FOMOD dépasse la limite d’analyse des collisions; le plan est bloqué plutôt que partiellement vérifié.".to_string());
                        break 'collision_check;
                    }
                    let right_target =
                        archive_path_key(&right.target.to_string_lossy().replace('\\', "/"));
                    let same_target = target == right_target;
                    let ambiguous_overwrite = same_target
                        && left.archive_index != right.archive_index
                        && left.priority == right.priority;
                    if destinations_overlap(&target, &right_target)
                        && (!same_target || ambiguous_overwrite)
                    {
                        add_warning(&mut warnings, format!("Collision FOMOD ambiguë à `{target}` entre options pouvant être sélectionnées ensemble."));
                    }
                }
            }
        }
    }
    if required_files.is_empty()
        && steps
            .iter()
            .flat_map(|step| &step.groups)
            .flat_map(|group| &group.options)
            .all(|option| option.files.is_empty())
    {
        add_warning(
            &mut warnings,
            "Le FOMOD ne déclare aucun fichier statique à installer.".to_string(),
        );
    }
    // Fail closed: every warning currently means a rule, source, destination,
    // ordering mode, or condition was not fully validated. Never stage a plan
    // whose safe interpretation is uncertain.
    let support_status = if warnings.is_empty() {
        "supported"
    } else {
        "unsupported"
    };
    FomodArchivePlan {
        name,
        author,
        version,
        support_status: support_status.to_string(),
        required_file_count: required_files.len(),
        archive_fingerprint: String::new(),
        steps,
        warnings,
        required_files,
    }
}

pub(crate) fn analyze_if_fomod(path: &Path) -> Result<Option<FomodArchivePlan>, String> {
    match analyze_archive(path) {
        Ok(plan) => Ok(Some(plan)),
        Err(error) if error == "No fomod/ModuleConfig.xml was found in this ZIP archive." => {
            Ok(None)
        }
        Err(error) => Err(error),
    }
}

pub(crate) fn analyze_archive(path: &Path) -> Result<FomodArchivePlan, String> {
    let file = File::open(path).map_err(|error| format!("Cannot open FOMOD archive: {error}"))?;
    let mut archive =
        ZipArchive::new(file).map_err(|error| format!("Invalid ZIP archive: {error}"))?;
    let (entries, lookup) = archive_entries(&mut archive)?;
    let config_paths = entries
        .iter()
        .filter(|entry| !entry.is_dir && has_fomod_member(&entry.path, "ModuleConfig.xml"))
        .collect::<Vec<_>>();
    if config_paths.is_empty() {
        return Err("No fomod/ModuleConfig.xml was found in this ZIP archive.".to_string());
    }
    if config_paths.len() > 1 {
        return Ok(FomodArchivePlan {
            name: path.file_stem().and_then(|value| value.to_str()).unwrap_or("FOMOD mod").to_string(),
            author: None,
            version: None,
            support_status: "unsupported".into(),
            required_file_count: 0,
            archive_fingerprint: super::fingerprint_path(path),
            steps: Vec::new(),
            warnings: vec!["Plusieurs fichiers `fomod/ModuleConfig.xml` sont présents; leur sélection est ambiguë.".into()],
            required_files: Vec::new(),
        });
    }
    let config = config_paths[0];
    let config_path = config.path.clone();
    let config_index = config.index;
    let config_bytes = read_entry(&mut archive, config_index, MAX_XML_BYTES)?;
    let config_text = decode_xml(&config_bytes)?;
    let module = parse_xml(&config_text)?;
    if module.name != "config" {
        return Err("FOMOD ModuleConfig.xml must have a `<config>` root element.".into());
    }
    let info_entries = entries
        .iter()
        .filter(|entry| !entry.is_dir && has_fomod_member(&entry.path, "info.xml"))
        .collect::<Vec<_>>();
    if info_entries.len() > 1 {
        return Ok(FomodArchivePlan {
            name: path
                .file_stem()
                .and_then(|value| value.to_str())
                .unwrap_or("FOMOD mod")
                .to_string(),
            author: None,
            version: None,
            support_status: "unsupported".into(),
            required_file_count: 0,
            archive_fingerprint: super::fingerprint_path(path),
            steps: Vec::new(),
            warnings: vec![
                "Plusieurs fichiers `fomod/info.xml` sont présents; les métadonnées sont ambiguës."
                    .into(),
            ],
            required_files: Vec::new(),
        });
    }
    let info_index = info_entries.first().map(|entry| entry.index);
    let info = match info_index {
        Some(index) => {
            let bytes = read_entry(&mut archive, index, MAX_XML_BYTES)?;
            let text = decode_xml(&bytes)?;
            Some(parse_xml(&text)?)
        }
        None => None,
    };
    let fallback_name = path
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("FOMOD mod");
    let mut plan = build_plan(
        &module,
        info.as_ref(),
        &config_path,
        &entries,
        &mut archive,
        &lookup,
        fallback_name,
    );
    plan.archive_fingerprint = super::fingerprint_path(path);
    Ok(plan)
}

pub(crate) fn validate_selection(
    plan: &FomodArchivePlan,
    selected_ids: &[String],
) -> Result<HashSet<String>, String> {
    if plan.support_status != "supported" {
        return Err("Ce FOMOD contient des règles non prises en charge ou non vérifiées ; aucun fichier n’a été installé.".into());
    }
    let selected = selected_ids.iter().cloned().collect::<HashSet<_>>();
    if selected.len() != selected_ids.len() {
        return Err("La sélection FOMOD contient des options en double.".into());
    }
    let known = plan
        .steps
        .iter()
        .flat_map(|step| step.groups.iter())
        .flat_map(|group| group.options.iter())
        .map(|option| option.id.as_str())
        .collect::<HashSet<_>>();
    if selected.iter().any(|id| !known.contains(id.as_str())) {
        return Err("La sélection FOMOD contient une option inconnue.".into());
    }
    for step in &plan.steps {
        for group in &step.groups {
            let chosen = group
                .options
                .iter()
                .filter(|option| selected.contains(&option.id))
                .collect::<Vec<_>>();
            if chosen.iter().any(|option| !option.selectable) {
                return Err(format!(
                    "Une option non sélectionnable a été choisie dans `{}`.",
                    group.name
                ));
            }
            if group
                .options
                .iter()
                .any(|option| option.required && !selected.contains(&option.id))
            {
                return Err(format!(
                    "L’option obligatoire du groupe `{}` manque.",
                    group.name
                ));
            }
            let count = chosen.len();
            let valid = match group.selection_type.to_ascii_lowercase().as_str() {
                "selectall" => {
                    count
                        == group
                            .options
                            .iter()
                            .filter(|option| option.selectable)
                            .count()
                }
                "selectany" => true,
                "selectatleastone" | "selectexactlyone" | "selectone" => count >= 1,
                "selectatmostone" => count <= 1,
                _ => false,
            } && (!matches!(
                group.selection_type.to_ascii_lowercase().as_str(),
                "selectexactlyone" | "selectone"
            ) || count == 1);
            if !valid {
                return Err(format!(
                    "La sélection du groupe `{}` ne respecte pas `{}`.",
                    group.name, group.selection_type
                ));
            }
        }
    }
    Ok(selected)
}

fn resolve_rule(
    rule: &FomodFileRule,
    entries: &[ArchiveEntry],
    prefix: &str,
    config_dir: &str,
    lookup: &HashMap<String, usize>,
) -> Result<Vec<ResolvedFile>, String> {
    let source_path = normalize_archive_path(&rule.source)?;
    let resolved_source = if rule.folder {
        let mut candidates = vec![source_path.clone()];
        if !prefix.is_empty() {
            candidates.push(format!("{prefix}/{source_path}"));
        }
        if !config_dir.is_empty() {
            candidates.push(format!("{config_dir}/{source_path}"));
        }
        candidates.sort_by_key(|candidate| archive_path_key(candidate));
        candidates.dedup_by(|left, right| archive_path_key(left) == archive_path_key(right));
        let matches = candidates
            .into_iter()
            .filter(|candidate| {
                let starts_with = format!("{}/", archive_path_key(candidate));
                entries.iter().any(|entry| {
                    !entry.is_dir && archive_path_key(&entry.path).starts_with(&starts_with)
                })
            })
            .collect::<Vec<_>>();
        if matches.len() > 1 {
            return Err(format!(
                "FOMOD folder source `{}` resolves to multiple archive roots.",
                rule.source
            ));
        }
        matches
            .into_iter()
            .next()
            .unwrap_or_else(|| source_path.clone())
    } else {
        find_member(&source_path, prefix, config_dir, lookup)?
            .map(|index| entries[index].path.clone())
            .unwrap_or_else(|| source_path.clone())
    };
    let source_key = archive_path_key(&resolved_source);
    let members = if rule.folder {
        let starts_with = format!("{source_key}/");
        let mut selected = Vec::new();
        for entry in entries.iter().filter(|entry| {
            !entry.is_dir && archive_path_key(&entry.path).starts_with(&starts_with)
        }) {
            if selected.len() == MAX_FOMOD_FOLDER_MEMBERS {
                return Err(format!(
                    "FOMOD folder source `{}` contains more than {MAX_FOMOD_FOLDER_MEMBERS} files.",
                    rule.source
                ));
            }
            selected.push(entry);
        }
        if selected.is_empty() {
            return Err(format!(
                "FOMOD folder source `{}` is missing or empty.",
                rule.source
            ));
        }
        selected
    } else {
        let index = find_member(&source_path, prefix, config_dir, lookup)?
            .ok_or_else(|| format!("FOMOD file source `{}` is missing.", rule.source))?;
        if entries[index].is_dir {
            return Err(format!(
                "FOMOD file source `{}` points to a directory.",
                rule.source
            ));
        }
        vec![&entries[index]]
    };

    members
        .into_iter()
        .map(|member| {
            let target = if rule.folder {
                if let Some(destination) = &rule.destination {
                    let destination = normalize_archive_path(destination)?;
                    let relative = strip_prefix_case_insensitive(&member.path, &resolved_source)
                        .ok_or_else(|| {
                            format!("Cannot resolve folder member `{}`.", member.path)
                        })?;
                    PathBuf::from(destination).join(relative)
                } else {
                    let relative = strip_prefix_case_insensitive(&member.path, &resolved_source)
                        .ok_or_else(|| {
                            format!("Cannot resolve folder member `{}`.", member.path)
                        })?;
                    super::cyberpunk_map_file(Path::new(relative)).ok_or_else(|| {
                        format!(
                            "No Cyberpunk destination can be inferred for `{}`.",
                            relative
                        )
                    })?
                }
            } else if let Some(destination) = &rule.destination {
                let destination = normalize_archive_path(destination)?;
                let file_name = member
                    .path
                    .rsplit('/')
                    .next()
                    .filter(|name| !name.is_empty())
                    .ok_or_else(|| {
                        format!("FOMOD file source `{}` has no file name.", rule.source)
                    })?;
                PathBuf::from(destination).join(file_name)
            } else {
                let file_name = member
                    .path
                    .rsplit('/')
                    .next()
                    .filter(|name| !name.is_empty())
                    .ok_or_else(|| {
                        format!("FOMOD file source `{}` has no file name.", rule.source)
                    })?;
                PathBuf::from(file_name)
            };
            let target_text = target.to_string_lossy().replace('\\', "/");
            let target = normalize_archive_path(&target_text)?;
            super::validate_archive_relative(Path::new(&target))?;
            let mapped = super::cyberpunk_map_file(Path::new(&target)).ok_or_else(|| {
                format!("Destination `{target}` is not a recognized Cyberpunk game root.")
            })?;
            if mapped.to_string_lossy().replace('\\', "/") != target {
                return Err(format!(
                    "Destination `{target}` contains an ambiguous extra root."
                ));
            }
            Ok(ResolvedFile {
                archive_index: member.index,
                target: mapped,
                size: member.size,
                priority: rule.priority,
            })
        })
        .collect()
}

pub(crate) fn materialize_selected(
    archive_path: &Path,
    plan: &FomodArchivePlan,
    selected_ids: &[String],
    destination: &Path,
) -> Result<Vec<String>, String> {
    let selected = validate_selection(plan, selected_ids)?;
    let file =
        File::open(archive_path).map_err(|error| format!("Cannot open FOMOD archive: {error}"))?;
    let mut archive =
        ZipArchive::new(file).map_err(|error| format!("Invalid ZIP archive: {error}"))?;
    let (entries, lookup) = archive_entries(&mut archive)?;
    if super::fingerprint_path(archive_path) != plan.archive_fingerprint {
        return Err(
            "L’archive FOMOD a changé depuis son analyse ; relancez l’aperçu avant l’installation."
                .into(),
        );
    }
    let config_paths = entries
        .iter()
        .filter(|entry| !entry.is_dir && has_fomod_member(&entry.path, "ModuleConfig.xml"))
        .collect::<Vec<_>>();
    if config_paths.len() != 1 {
        return Err(
            "FOMOD ModuleConfig.xml is missing or ambiguous in the selected archive.".into(),
        );
    }
    let config_path = config_paths[0].path.clone();
    let prefix = archive_prefix(&config_path);
    let config_dir = config_directory(&config_path);
    let mut rules = plan.required_files.clone();
    for step in &plan.steps {
        for group in &step.groups {
            for option in &group.options {
                if selected.contains(&option.id) {
                    rules.extend(option.files.clone());
                }
            }
        }
    }
    let mut resolved = Vec::new();
    for rule in &rules {
        resolved.extend(resolve_rule(rule, &entries, &prefix, &config_dir, &lookup)?);
    }
    resolved.sort_by(|left, right| {
        archive_path_key(&left.target.to_string_lossy())
            .cmp(&archive_path_key(&right.target.to_string_lossy()))
            .then(left.archive_index.cmp(&right.archive_index))
    });
    if resolved.is_empty() {
        return Err("The selected FOMOD options contain no installable files.".into());
    }
    let mut winners = HashMap::<String, ResolvedFile>::new();
    for item in resolved {
        let key = archive_path_key(&item.target.to_string_lossy().replace('\\', "/"));
        if let Some(previous) = winners.get(&key) {
            if previous.archive_index == item.archive_index {
                continue;
            }
            if previous.priority == item.priority {
                return Err(format!("Selected FOMOD options collide at `{key}` with equal priority; the overwrite rule is ambiguous."));
            }
            if item.priority > previous.priority {
                winners.insert(key, item);
            }
        } else {
            winners.insert(key, item);
        }
    }
    let mut resolved = winners.into_values().collect::<Vec<_>>();
    resolved.sort_by(|left, right| {
        archive_path_key(&left.target.to_string_lossy())
            .cmp(&archive_path_key(&right.target.to_string_lossy()))
            .then(left.archive_index.cmp(&right.archive_index))
    });
    let mut resolved_targets = HashSet::new();
    for item in &resolved {
        let key = archive_path_key(&item.target.to_string_lossy().replace('\\', "/"));
        for (separator_index, character) in key.char_indices() {
            if character == '/' && resolved_targets.contains(&key[..separator_index]) {
                return Err(format!(
                    "Selected FOMOD files overlap at `{key}` and cannot be staged safely."
                ));
            }
        }
        resolved_targets.insert(key);
    }
    let total_bytes = resolved
        .iter()
        .try_fold(0u64, |total, item| total.checked_add(item.size))
        .ok_or_else(|| "Selected FOMOD files exceed the 4 GB extraction limit.".to_string())?;
    if total_bytes > MAX_ARCHIVE_UNPACKED_BYTES {
        return Err("Selected FOMOD files exceed the 4 GB extraction limit.".into());
    }
    if destination.exists() {
        return Err("FOMOD staging destination already exists.".into());
    }
    fs::create_dir(destination)
        .map_err(|error| format!("Cannot exclusively create FOMOD staging directory: {error}"))?;
    let mut destination_cleanup = super::DirectoryCleanupGuard::new(destination.to_path_buf());
    let extraction = (|| {
        for item in &resolved {
            let target = destination.join(&item.target);
            if !target.starts_with(destination) {
                return Err("Resolved FOMOD destination escaped its staging directory.".into());
            }
            if let Some(parent) = target.parent() {
                fs::create_dir_all(parent)
                    .map_err(|error| format!("Cannot create staged directory: {error}"))?;
            }
            let source = archive
                .by_index(item.archive_index)
                .map_err(|error| format!("Cannot read selected FOMOD file: {error}"))?;
            let mut bounded_source = source.take(item.size.saturating_add(1));
            let mut output = File::create(&target)
                .map_err(|error| format!("Cannot stage selected FOMOD file: {error}"))?;
            let copied = copy(&mut bounded_source, &mut output)
                .map_err(|error| format!("Cannot extract selected FOMOD file: {error}"))?;
            if copied != item.size {
                return Err(format!(
                    "Selected FOMOD file `{}` was truncated during extraction.",
                    item.target.display()
                ));
            }
        }
        Ok(())
    })();
    extraction?;
    destination_cleanup.preserve();
    Ok(resolved
        .iter()
        .map(|item| item.target.to_string_lossy().replace('\\', "/"))
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use zip::{write::SimpleFileOptions, ZipWriter};

    fn test_zip(path: &Path, entries: &[(&str, &[u8])]) {
        let file = File::create(path).expect("create test ZIP");
        let mut zip = ZipWriter::new(file);
        for (name, bytes) in entries {
            zip.start_file(*name, SimpleFileOptions::default())
                .expect("add test entry");
            zip.write_all(bytes).expect("write test entry");
        }
        zip.finish().expect("finish test ZIP");
    }

    fn static_module_config() -> &'static str {
        r#"<?xml version="1.0" encoding="UTF-8"?>
<config>
  <moduleName>Sample car</moduleName>
  <requiredInstallFiles order="Explicit"><file source="fomod/base/archive/pc/mod/base.archive" destination="archive/pc/mod"/></requiredInstallFiles>
  <installSteps order="Explicit">
    <installStep name="Body colour">
      <optionalFileGroups order="Explicit">
        <group name="Paint" type="SelectExactlyOne">
          <plugins order="Explicit">
            <plugin name="Blue" type="Recommended"><description>Blue body</description><image path="Images/blue.png"/><files><file source="fomod/options/blue/paint.archive" destination="archive/pc/mod"/></files></plugin>
            <plugin name="Red" type="Optional"><files><file source="fomod/options/red/paint.archive" destination="archive/pc/mod"/></files></plugin>
          </plugins>
        </group>
        <group name="Extras" type="SelectAny">
          <plugins order="Explicit"><plugin name="Rollbar" type="Optional"><files><file source="fomod/options/rollbar.archive" destination="archive/pc/mod"/></files></plugin></plugins>
        </group>
      </optionalFileGroups>
    </installStep>
  </installSteps>
</config>"#
    }

    #[test]
    fn parses_static_fomod_groups_defaults_images_and_required_files() {
        let parsed = parse_xml(static_module_config()).expect("parse sample FOMOD");
        assert_eq!(parsed.name, "config");
        let temp = std::env::temp_dir().join(format!("zailon-fomod-plan-{}", std::process::id()));
        let zip_path = temp.with_extension("zip");
        let _ = fs::remove_file(&zip_path);
        test_zip(
            &zip_path,
            &[
                ("fomod/ModuleConfig.xml", static_module_config().as_bytes()),
                ("fomod/info.xml", b"<fomod><Name>Sample car</Name><Version>2.0</Version><Author>Test</Author></fomod>"),
                ("fomod/base/archive/pc/mod/base.archive", b"base"),
                ("fomod/options/blue/paint.archive", b"blue"),
                ("fomod/options/red/paint.archive", b"red"),
                ("fomod/options/rollbar.archive", b"rollbar"),
                ("fomod/Images/blue.png", b"png-data"),
            ],
        );
        let plan = analyze_archive(&zip_path).expect("analyze FOMOD ZIP");
        assert_eq!(plan.name, "Sample car");
        assert_eq!(plan.author.as_deref(), Some("Test"));
        assert_eq!(plan.version.as_deref(), Some("2.0"));
        assert_eq!(
            plan.support_status, "supported",
            "mutually exclusive options may share a destination"
        );
        assert_eq!(plan.required_file_count, 1);
        assert_eq!(plan.steps.len(), 1);
        assert_eq!(plan.steps[0].groups.len(), 2);
        let paint = &plan.steps[0].groups[0];
        assert_eq!(paint.selection_type, "SelectExactlyOne");
        assert!(paint.options[0].selected_by_default);
        assert!(!paint.options[1].selected_by_default);
        assert!(paint.options[0]
            .image_data_url
            .as_deref()
            .unwrap()
            .starts_with("data:image/png;base64,"));
        fs::remove_file(zip_path).expect("remove test ZIP");
    }

    #[test]
    fn rejects_excessive_fomod_file_rules_before_resolving_sources() {
        let root =
            std::env::temp_dir().join(format!("zailon-fomod-rule-limit-{}", std::process::id()));
        let zip_path = root.with_extension("zip");
        let _ = fs::remove_file(&zip_path);
        let mut xml = String::from("<config><requiredInstallFiles order=\"Explicit\">");
        for index in 0..=MAX_FOMOD_FILE_RULES {
            xml.push_str(&format!(
                "<file source=\"fomod/missing-{index}.archive\" destination=\"archive/pc/mod/file-{index}.archive\"/>"
            ));
        }
        xml.push_str("</requiredInstallFiles></config>");
        test_zip(&zip_path, &[("fomod/ModuleConfig.xml", xml.as_bytes())]);
        let plan = analyze_archive(&zip_path).expect("analyze over-limit FOMOD");
        assert_eq!(plan.support_status, "unsupported");
        assert!(plan
            .warnings
            .iter()
            .any(|warning| warning.contains("dépasse les limites d’analyse")));
        fs::remove_file(zip_path).expect("remove over-limit ZIP");
    }

    #[test]
    fn file_destination_is_a_directory_and_original_filename_is_preserved() {
        let rule = FomodFileRule {
            source: "fomod/options/paint.archive".into(),
            destination: Some("archive/pc/mod".into()),
            folder: false,
            priority: 0,
        };
        let entries = vec![ArchiveEntry {
            path: "fomod/options/paint.archive".into(),
            index: 0,
            is_dir: false,
            size: 4,
        }];
        let lookup = HashMap::from([(archive_path_key("fomod/options/paint.archive"), 0)]);
        let resolved = resolve_rule(&rule, &entries, "", "fomod", &lookup).unwrap();
        assert_eq!(
            resolved[0].target,
            PathBuf::from("archive/pc/mod/paint.archive")
        );
    }

    #[test]
    fn file_without_destination_does_not_guess_from_archive_source_path() {
        let rule = FomodFileRule {
            source: "fomod/archive/pc/mod/default.archive".into(),
            destination: None,
            folder: false,
            priority: 0,
        };
        let entries = vec![ArchiveEntry {
            path: "fomod/archive/pc/mod/default.archive".into(),
            index: 0,
            is_dir: false,
            size: 7,
        }];
        let lookup = HashMap::from([(archive_path_key("fomod/archive/pc/mod/default.archive"), 0)]);
        assert!(resolve_rule(&rule, &entries, "", "fomod", &lookup).is_err());
    }

    #[test]
    fn folder_without_destination_maps_relative_contents_not_archive_source_path() {
        let rule = FomodFileRule {
            source: "fomod/mods/bundle".into(),
            destination: None,
            folder: true,
            priority: 0,
        };
        let entries = vec![ArchiveEntry {
            path: "fomod/mods/bundle/archive/pc/mod/default.archive".into(),
            index: 0,
            is_dir: false,
            size: 7,
        }];
        let lookup = HashMap::new();
        let resolved = resolve_rule(&rule, &entries, "", "fomod", &lookup).unwrap();
        assert_eq!(
            resolved[0].target,
            PathBuf::from("archive/pc/mod/default.archive")
        );
    }

    #[test]
    fn fomod_files_must_be_direct_children_of_a_fomod_directory() {
        assert_eq!(archive_prefix("fomod/ModuleConfig.xml"), "");
        assert_eq!(archive_prefix("mods/FOMOD/ModuleConfig.xml"), "mods");
        assert!(has_fomod_member(
            "mods/fomod/ModuleConfig.xml",
            "ModuleConfig.xml"
        ));
        assert!(!has_fomod_member(
            "mods/notfomod/ModuleConfig.xml",
            "ModuleConfig.xml"
        ));
        assert!(!has_fomod_member(
            "mods/fomod/nested/ModuleConfig.xml",
            "ModuleConfig.xml"
        ));
        assert!(!has_fomod_member("mods/fomod/ModuleConfig.xml", "info.xml"));
    }

    #[test]
    fn archive_path_key_catches_unicode_case_aliases() {
        for (left, right) in [
            ("archive/pc/mod/Ä.archive", "archive/pc/mod/ä.archive"),
            ("archive/pc/mod/Σ.archive", "archive/pc/mod/ς.archive"),
        ] {
            assert_eq!(archive_path_key(left), archive_path_key(right));
        }
    }

    #[test]
    fn archive_paths_with_boundary_whitespace_are_rejected() {
        assert!(normalize_archive_path(" fomod/file.archive").is_err());
        assert!(normalize_archive_path("fomod/file.archive ").is_err());
        for path in [
            "archive/pc/mod/trailing./file.archive",
            "archive/pc/mod/trailing /file.archive",
            "archive/pc/mod/CON",
            "archive/pc/mod/con.txt",
            "archive/pc/mod/LPT1.log",
            "archive/pc/mod/invalid?.archive",
            "archive/pc/mod/invalid*.archive",
            "archive/pc/mod/invalid<name.archive",
        ] {
            assert!(
                normalize_archive_path(path).is_err(),
                "Windows alias path must be rejected: {path}"
            );
        }
        let xml = r#"<requiredInstallFiles><file source="fomod/file.archive" destination=" archive/pc/mod/file.archive"/></requiredInstallFiles>"#;
        let parsed = parse_xml(xml).expect("parse destination fixture");
        let mut warnings = Vec::new();
        rules_from_container(Some(&parsed), &mut warnings);
        assert!(
            !warnings.is_empty(),
            "destination whitespace must not be silently trimmed"
        );
        let empty_destination = parse_xml(
            r#"<requiredInstallFiles><file source="fomod/file.archive" destination=""/></requiredInstallFiles>"#,
        )
        .expect("parse default destination");
        let mut warnings = Vec::new();
        let rules = rules_from_container(Some(&empty_destination), &mut warnings);
        assert_eq!(rules.len(), 1);
        assert!(rules[0].destination.is_none());
        assert!(
            warnings.is_empty(),
            "an empty destination is a valid FOMOD default"
        );
    }

    #[test]
    fn archive_paths_reject_case_collisions_and_file_parent_conflicts() {
        let root = std::env::temp_dir().join(format!(
            "zailon-fomod-path-collisions-{}",
            std::process::id()
        ));
        let fixtures: [(&str, &[(&str, &[u8])]); 3] = [
            (
                "case",
                &[
                    ("Folder/mod.archive", b"one"),
                    ("folder/mod.archive", b"two"),
                ],
            ),
            (
                "file-first",
                &[("parent", b"file"), ("parent/child.archive", b"child")],
            ),
            (
                "file-last",
                &[("parent/child.archive", b"child"), ("parent", b"file")],
            ),
        ];
        for (name, entries) in fixtures {
            let zip_path = root.with_file_name(format!(
                "{}-{name}.zip",
                root.file_name().unwrap().to_string_lossy()
            ));
            let _ = fs::remove_file(&zip_path);
            test_zip(&zip_path, entries);
            let file = File::open(&zip_path).expect("open collision fixture");
            let mut archive = ZipArchive::new(file).expect("open collision ZIP");
            assert!(
                archive_entries(&mut archive).is_err(),
                "fixture `{name}` must be rejected"
            );
            fs::remove_file(zip_path).expect("remove collision fixture");
        }
    }

    #[test]
    fn archive_entries_reject_unicode_case_collisions() {
        let root = std::env::temp_dir().join(format!(
            "zailon-fomod-unicode-collision-{}",
            std::process::id()
        ));
        let zip_path = root.with_extension("zip");
        let _ = fs::remove_file(&zip_path);
        test_zip(
            &zip_path,
            &[
                ("folder/Ä.archive", b"one"),
                ("folder/ä.archive", b"two"),
                ("folder/Σ.archive", b"three"),
                ("folder/ς.archive", b"four"),
            ],
        );
        let file = File::open(&zip_path).expect("open unicode collision fixture");
        let mut archive = ZipArchive::new(file).expect("open unicode collision ZIP");
        assert!(
            archive_entries(&mut archive).is_err(),
            "Unicode case aliases must be rejected"
        );
        fs::remove_file(zip_path).expect("remove unicode collision fixture");
    }

    #[test]
    fn folder_member_prefix_matching_is_unicode_case_insensitive() {
        assert_eq!(
            strip_prefix_case_insensitive("fomod/Options/Ä/body.archive", "FOMOD/options/ä"),
            Some("body.archive")
        );
    }

    #[test]
    fn archive_entries_limit_raw_path_bytes_before_path_normalization() {
        let root = std::env::temp_dir().join(format!(
            "zailon-fomod-raw-path-limit-{}",
            std::process::id()
        ));
        let zip_path = root.with_extension("zip");
        let _ = fs::remove_file(&zip_path);
        let file = File::create(&zip_path).expect("create raw path ZIP");
        let mut zip = ZipWriter::new(file);
        let redundant_components = "./".repeat(MAX_ARCHIVE_PATH_BYTES);
        let path = format!("fomod/{redundant_components}ModuleConfig.xml");
        zip.start_file(path, SimpleFileOptions::default())
            .expect("write long raw path");
        zip.write_all(b"<config/>").expect("write config");
        zip.finish().expect("finish raw path ZIP");
        let file = File::open(&zip_path).expect("open raw path ZIP");
        let mut archive = ZipArchive::new(file).expect("parse raw path ZIP");
        assert!(archive_entries(&mut archive).is_err());
        fs::remove_file(zip_path).expect("remove raw path ZIP");
    }

    #[test]
    fn archive_entries_accept_implicit_parent_directories() {
        let root = std::env::temp_dir().join(format!(
            "zailon-fomod-implicit-parent-{}",
            std::process::id()
        ));
        let zip_path = root.with_extension("zip");
        let _ = fs::remove_file(&zip_path);
        test_zip(&zip_path, &[("parent/child.archive", b"child")]);
        let file = File::open(&zip_path).expect("open nested fixture");
        let mut archive = ZipArchive::new(file).expect("open nested ZIP");
        assert!(
            archive_entries(&mut archive).is_ok(),
            "implicit parent directories are valid ZIP layout"
        );
        fs::remove_file(zip_path).expect("remove nested fixture");
    }

    #[test]
    fn rejects_overlapping_required_destinations() {
        let root = std::env::temp_dir().join(format!(
            "zailon-fomod-required-collision-{}",
            std::process::id()
        ));
        let zip_path = root.with_extension("zip");
        let _ = fs::remove_file(&zip_path);
        let xml = r#"<config><requiredInstallFiles order="Explicit"><file source="fomod/shared" destination="archive/pc/mod"/><file source="fomod/child.archive" destination="archive/pc/mod/shared"/></requiredInstallFiles></config>"#;
        test_zip(
            &zip_path,
            &[
                ("fomod/ModuleConfig.xml", xml.as_bytes()),
                ("fomod/shared", b"a"),
                ("fomod/child.archive", b"b"),
            ],
        );
        let plan = analyze_archive(&zip_path).expect("analyze required destination collision");
        assert_eq!(plan.support_status, "unsupported");
        assert!(plan.warnings.iter().any(
            |warning| warning.contains("règles obligatoires") && warning.contains("collision")
        ));
        fs::remove_file(zip_path).expect("remove collision ZIP");
    }

    #[test]
    fn nonselectable_option_does_not_create_a_required_file_collision() {
        let root = std::env::temp_dir().join(format!(
            "zailon-fomod-nonselectable-collision-{}",
            std::process::id()
        ));
        let zip_path = root.with_extension("zip");
        let _ = fs::remove_file(&zip_path);
        let xml = r#"<config><requiredInstallFiles order="Explicit"><file source="fomod/required/shared.archive" destination="archive/pc/mod"/></requiredInstallFiles><installSteps order="Explicit"><installStep name="Choices"><optionalFileGroups order="Explicit"><group name="Unavailable" type="SelectAny"><plugins order="Explicit"><plugin name="Unavailable file" type="NotUsable"><files><file source="fomod/unavailable/shared.archive" destination="archive/pc/mod"/></files></plugin></plugins></group></optionalFileGroups></installStep></installSteps></config>"#;
        test_zip(
            &zip_path,
            &[
                ("fomod/ModuleConfig.xml", xml.as_bytes()),
                ("fomod/required/shared.archive", b"required"),
                ("fomod/unavailable/shared.archive", b"unavailable"),
            ],
        );
        let plan = analyze_archive(&zip_path).expect("analyze nonselectable option");
        assert_eq!(
            plan.support_status, "supported",
            "uninstallable option must not conflict with a required file"
        );
        assert!(!plan
            .warnings
            .iter()
            .any(|warning| warning.contains("chevauche un fichier obligatoire")));
        fs::remove_file(zip_path).expect("remove nonselectable collision ZIP");
    }

    #[test]
    fn rejects_unicode_case_aliases_in_required_game_destinations() {
        let root = std::env::temp_dir().join(format!(
            "zailon-fomod-unicode-target-collision-{}",
            std::process::id()
        ));
        let zip_path = root.with_extension("zip");
        let _ = fs::remove_file(&zip_path);
        let xml = r#"<config><requiredInstallFiles order="Explicit"><file source="fomod/a/Ä.archive" destination="archive/pc/mod"/><file source="fomod/b/ä.archive" destination="archive/pc/mod"/><file source="fomod/c/Σ.archive" destination="archive/pc/mod"/><file source="fomod/d/ς.archive" destination="archive/pc/mod"/></requiredInstallFiles></config>"#;
        test_zip(
            &zip_path,
            &[
                ("fomod/ModuleConfig.xml", xml.as_bytes()),
                ("fomod/a/Ä.archive", b"a"),
                ("fomod/b/ä.archive", b"b"),
                ("fomod/c/Σ.archive", b"c"),
                ("fomod/d/ς.archive", b"d"),
            ],
        );
        let plan = analyze_archive(&zip_path).expect("analyze Unicode target collision");
        assert_eq!(plan.support_status, "unsupported");
        assert!(plan
            .warnings
            .iter()
            .any(|warning| warning.contains("collision de destination")));
        fs::remove_file(zip_path).expect("remove Unicode target collision ZIP");
    }

    #[test]
    fn rejects_equal_priority_collisions_across_independently_selectable_groups() {
        let root = std::env::temp_dir().join(format!(
            "zailon-fomod-cross-group-collision-{}",
            std::process::id()
        ));
        let zip_path = root.with_extension("zip");
        let _ = fs::remove_file(&zip_path);
        let xml = r#"<config><installSteps order="Explicit"><installStep name="Choices"><optionalFileGroups order="Explicit"><group name="First" type="SelectAny"><plugins order="Explicit"><plugin name="A" type="Optional"><files><file source="fomod/first/shared.archive" destination="archive/pc/mod"/></files></plugin></plugins></group><group name="Second" type="SelectAny"><plugins order="Explicit"><plugin name="B" type="Optional"><files><file source="fomod/second/shared.archive" destination="archive/pc/mod"/></files></plugin></plugins></group></optionalFileGroups></installStep></installSteps></config>"#;
        test_zip(
            &zip_path,
            &[
                ("fomod/ModuleConfig.xml", xml.as_bytes()),
                ("fomod/first/shared.archive", b"a"),
                ("fomod/second/shared.archive", b"b"),
            ],
        );
        let plan = analyze_archive(&zip_path).expect("analyze cross-group collision");
        assert_eq!(plan.support_status, "unsupported");
        assert!(plan
            .warnings
            .iter()
            .any(|warning| warning.contains("Collision FOMOD ambiguë")));
        fs::remove_file(zip_path).expect("remove collision ZIP");
    }

    #[test]
    fn rejects_unsupported_fomod_conditions_instead_of_guessing() {
        let root =
            std::env::temp_dir().join(format!("zailon-fomod-unsupported-{}", std::process::id()));
        let zip_path = root.with_extension("zip");
        let extraction = root.with_extension("out");
        let _ = fs::remove_file(&zip_path);
        let _ = fs::remove_dir_all(&extraction);
        let xml = r#"<config><installSteps order="Explicit"><installStep name="Conditional"><optionalFileGroups order="Explicit"><group name="X" type="SelectAny"><plugins order="Explicit"><plugin name="A" type="Optional"><dependencies operator="And"><dependencies><flagDependency flag="color" value="blue"/></dependencies></dependencies><files><futureRule/><file source="fomod/a.archive" destination="archive/pc/mod/a.archive" installIfUsable="true"/></files></plugin></plugins></group></optionalFileGroups></installStep></installSteps></config>"#;
        test_zip(
            &zip_path,
            &[
                ("fomod/ModuleConfig.xml", xml.as_bytes()),
                ("fomod/a.archive", b"conditional"),
            ],
        );
        let plan = analyze_archive(&zip_path).expect("analyze conditional config");
        assert_eq!(plan.support_status, "unsupported");
        assert!(plan
            .warnings
            .iter()
            .any(|warning| warning.contains("conditionnelle")));
        assert!(plan
            .warnings
            .iter()
            .any(|warning| warning.contains("futureRule")));
        assert!(plan
            .warnings
            .iter()
            .any(|warning| warning.contains("installIfUsable")));
        assert!(materialize_selected(&zip_path, &plan, &[], &extraction).is_err());
        let selected = vec![plan.steps[0].groups[0].options[0].id.clone()];
        assert!(materialize_selected(&zip_path, &plan, &selected, &extraction).is_err());
        assert!(
            !extraction.exists(),
            "unsupported FOMOD must fail before extraction"
        );
        fs::remove_file(zip_path).expect("remove unsupported ZIP");
    }

    #[test]
    fn unknown_top_level_configuration_is_not_treated_as_an_empty_supported_installer() {
        let parsed = parse_xml("<config><futureRule/></config>").expect("parse unknown config");
        let mut warnings = Vec::new();
        inspect_unsupported_features(&parsed, &[], &mut warnings);
        assert!(warnings
            .iter()
            .any(|warning| warning.contains("futureRule")));
        assert!(warnings
            .iter()
            .any(|warning| warning.contains("aucune étape")));
    }

    #[test]
    fn multiple_fomod_configs_are_visible_but_unsupported() {
        let root = std::env::temp_dir().join(format!(
            "zailon-fomod-multiple-config-{}",
            std::process::id()
        ));
        let zip_path = root.with_extension("zip");
        let _ = fs::remove_file(&zip_path);
        test_zip(
            &zip_path,
            &[
                (
                    "first/fomod/ModuleConfig.xml",
                    static_module_config().as_bytes(),
                ),
                (
                    "second/fomod/ModuleConfig.xml",
                    static_module_config().as_bytes(),
                ),
            ],
        );
        let plan = analyze_archive(&zip_path).expect("ambiguous FOMOD remains analyzable");
        assert_eq!(plan.support_status, "unsupported");
        assert!(plan
            .warnings
            .iter()
            .any(|warning| warning.contains("Plusieurs fichiers")));
        assert!(validate_selection(&plan, &[]).is_err());
        fs::remove_file(zip_path).expect("remove ZIP fixture");
    }

    #[test]
    fn existing_materialization_destination_is_never_removed_or_overwritten() {
        let root = std::env::temp_dir().join(format!(
            "zailon-fomod-owned-destination-{}",
            std::process::id()
        ));
        let zip_path = root.with_extension("zip");
        let _ = fs::remove_dir_all(&root);
        let _ = fs::remove_file(&zip_path);
        test_zip(
            &zip_path,
            &[
                ("fomod/ModuleConfig.xml", static_module_config().as_bytes()),
                ("fomod/base/archive/pc/mod/base.archive", b"base"),
                ("fomod/options/blue/paint.archive", b"blue"),
                ("fomod/options/red/paint.archive", b"red"),
                ("fomod/options/rollbar.archive", b"rollbar"),
            ],
        );
        fs::create_dir_all(&root).expect("create preexisting destination");
        fs::write(root.join("sentinel.txt"), b"keep me").expect("create sentinel");
        let plan = analyze_archive(&zip_path).expect("analyze FOMOD");
        let selected = vec![plan.steps[0].groups[0].options[0].id.clone()];
        assert!(materialize_selected(&zip_path, &plan, &selected, &root).is_err());
        assert_eq!(fs::read(root.join("sentinel.txt")).unwrap(), b"keep me");
        fs::remove_dir_all(root).expect("remove destination fixture");
        fs::remove_file(zip_path).expect("remove ZIP fixture");
    }

    #[test]
    fn xml_entity_references_are_decoded_and_unknown_entities_rejected() {
        let parsed = parse_xml("<config><moduleName>Blue &amp; red &#x1F697;</moduleName><description>A &amp; B</description></config>").expect("decode XML entities");
        assert_eq!(
            parsed.child("moduleName").unwrap().text_content(),
            "Blue & red 🚗"
        );
        assert_eq!(parsed.child("description").unwrap().text_content(), "A & B");
        assert!(parse_xml("<config><moduleName>&external;</moduleName></config>").is_err());
        assert!(parse_xml(
            "<config xmlns:x='urn:custom'><x:moduleName>Ignored</x:moduleName></config>"
        )
        .is_ok_and(|root| {
            let mut warnings = Vec::new();
            inspect_xml_structure(&root, &mut warnings);
            !warnings.is_empty()
        }));
        let wrong_case = parse_xml("<config><ModuleName>Wrong case</ModuleName></config>")
            .expect("parse case-variant config");
        let mut warnings = Vec::new();
        inspect_xml_structure(&wrong_case, &mut warnings);
        assert!(!warnings.is_empty());
        assert!(parse_xml("<config modulename='one' moduleName='two'/>").is_err());
        assert!(parse_xml("<config/>trailing</config>").is_err());
    }

    #[test]
    fn unrecognized_attribute_case_is_fail_closed() {
        let xml = r#"<config><requiredInstallFiles order="Explicit"><file source="fomod/file.archive" DESTINATION="archive/pc/mod/file.archive" INSTALLIFUSABLE="true"/></requiredInstallFiles></config>"#;
        let parsed = parse_xml(xml).expect("parse case-sensitive attribute fixture");
        let mut warnings = Vec::new();
        inspect_unsupported_features(&parsed, &[], &mut warnings);
        assert!(warnings
            .iter()
            .any(|warning| warning.contains("DESTINATION")));
        assert!(warnings
            .iter()
            .any(|warning| warning.contains("INSTALLIFUSABLE")));
    }

    #[test]
    fn warning_collection_is_bounded_and_fail_closed() {
        let mut warnings = Vec::new();
        for index in 0..MAX_FOMOD_WARNINGS * 4 {
            add_warning(&mut warnings, format!("Unknown XML element {index}"));
        }
        assert_eq!(warnings.len(), MAX_FOMOD_WARNINGS);
        assert_eq!(
            warnings.last().unwrap(),
            "Trop d’avertissements FOMOD pour détailler les règles non prises en charge."
        );
    }

    #[test]
    fn could_be_usable_options_are_blocked_as_condition_dependent() {
        let xml = r#"<config><installSteps order="Explicit"><installStep name="Conditional"><optionalFileGroups order="Explicit"><group name="Options" type="SelectAny"><plugins order="Explicit"><plugin name="Maybe" type="CouldBeUsable"/></plugins></group></optionalFileGroups></installStep></installSteps></config>"#;
        let parsed = parse_xml(xml).expect("parse conditional option type");
        let mut warnings = Vec::new();
        inspect_unsupported_features(&parsed, &[], &mut warnings);
        assert!(warnings.iter().any(|warning| warning.contains("condition")));
    }

    #[test]
    fn conditional_file_installs_are_recognized_and_blocked() {
        let xml = r#"<config><moduleName>Test</moduleName><conditionalFileInstalls><patterns><pattern><dependencies/><files><file source="fomod/post.archive"/></files></pattern></patterns></conditionalFileInstalls></config>"#;
        let parsed = parse_xml(xml).expect("parse conditional file installs");
        let mut warnings = Vec::new();
        inspect_unsupported_features(&parsed, &[], &mut warnings);
        assert!(warnings
            .iter()
            .any(|warning| warning.contains("conditionalFileInstalls")));
        assert!(warnings
            .iter()
            .any(|warning| warning.contains("post-sélection")));
    }

    #[test]
    fn impossible_selection_constraints_mark_plan_unsupported() {
        let xml = r#"<config><installSteps order="Explicit"><installStep name="Impossible"><optionalFileGroups order="Explicit"><group name="Required pair" type="SelectAtMostOne"><plugins order="Explicit"><plugin name="A" type="Required"/><plugin name="B" type="Required"/></plugins></group></optionalFileGroups></installStep></installSteps></config>"#;
        let parsed = parse_xml(xml).expect("parse impossible selection fixture");
        let mut warnings = Vec::new();
        inspect_unsupported_features(&parsed, &[], &mut warnings);
        assert!(warnings
            .iter()
            .any(|warning| warning.contains("statiquement impossibles")));
    }

    #[test]
    fn xml_text_content_preserves_mixed_content_order() {
        let parsed = parse_xml(
            "<config><moduleName>Install <em>the <b>red</b></em> car</moduleName></config>",
        )
        .expect("parse mixed-content XML");
        assert_eq!(
            parsed.child("moduleName").unwrap().text_content(),
            "Install the red car"
        );
        let adjacent =
            parse_xml("<config><moduleName>Install<em> the </em>car</moduleName></config>")
                .expect("parse adjacent mixed-content XML");
        assert_eq!(
            adjacent.child("moduleName").unwrap().text_content(),
            "Install the car"
        );
    }

    #[test]
    fn xml_nesting_depth_and_node_count_are_bounded() {
        let deep = format!(
            "<config>{}</config>",
            "<x>".repeat(MAX_XML_DEPTH + 1) + &"</x>".repeat(MAX_XML_DEPTH + 1)
        );
        assert!(parse_xml(&deep).is_err());
        let wide = format!("<config>{}</config>", "<x/>".repeat(MAX_XML_NODES + 1));
        assert!(parse_xml(&wide).is_err());
    }

    #[test]
    fn utf16_xml_is_decoded_without_loss() {
        let expected = "<fomod><Name>Voiture</Name></fomod>";
        let mut bytes = vec![0xFF, 0xFE];
        for unit in expected.encode_utf16() {
            bytes.extend_from_slice(&unit.to_le_bytes());
        }
        assert_eq!(decode_xml(&bytes).unwrap(), expected);
    }

    #[test]
    fn selected_fomod_options_extract_only_their_mapped_files() {
        let root =
            std::env::temp_dir().join(format!("zailon-fomod-extract-{}", std::process::id()));
        let zip_path = root.with_extension("zip");
        let _ = fs::remove_dir_all(&root);
        let _ = fs::remove_file(&zip_path);
        test_zip(
            &zip_path,
            &[
                ("fomod/ModuleConfig.xml", static_module_config().as_bytes()),
                ("fomod/base/archive/pc/mod/base.archive", b"base"),
                ("fomod/options/blue/paint.archive", b"blue"),
                ("fomod/options/red/paint.archive", b"red"),
                ("fomod/options/rollbar.archive", b"rollbar"),
            ],
        );
        let plan = analyze_archive(&zip_path).expect("analyze FOMOD");
        let selected = vec![
            plan.steps[0].groups[0].options[0].id.clone(),
            plan.steps[0].groups[1].options[0].id.clone(),
        ];
        let targets = materialize_selected(&zip_path, &plan, &selected, &root)
            .expect("extract selected options");
        assert_eq!(targets.len(), 3);
        assert_eq!(
            fs::read(root.join("archive/pc/mod/base.archive")).unwrap(),
            b"base"
        );
        assert_eq!(
            fs::read(root.join("archive/pc/mod/paint.archive")).unwrap(),
            b"blue"
        );
        assert_eq!(
            fs::read(root.join("archive/pc/mod/rollbar.archive")).unwrap(),
            b"rollbar"
        );
        assert!(!root.join("archive/pc/mod/paint-red.archive").exists());
        fs::remove_dir_all(root).expect("remove extraction fixture");
        fs::remove_file(zip_path).expect("remove ZIP fixture");
    }

    #[test]
    fn selection_constraints_and_unknown_ids_are_rejected() {
        let root = std::env::temp_dir().join(format!("zailon-fomod-choice-{}", std::process::id()));
        let zip_path = root.with_extension("zip");
        let _ = fs::remove_file(&zip_path);
        test_zip(
            &zip_path,
            &[
                ("fomod/ModuleConfig.xml", static_module_config().as_bytes()),
                ("fomod/base/archive/pc/mod/base.archive", b"base"),
                ("fomod/options/blue/paint.archive", b"blue"),
                ("fomod/options/red/paint.archive", b"red"),
                ("fomod/options/rollbar.archive", b"rollbar"),
            ],
        );
        let plan = analyze_archive(&zip_path).expect("analyze FOMOD");
        let red = plan.steps[0].groups[0].options[1].id.clone();
        let blue = plan.steps[0].groups[0].options[0].id.clone();
        assert!(validate_selection(&plan, &[blue.clone(), blue]).is_err());
        assert!(validate_selection(
            &plan,
            &[red.clone(), plan.steps[0].groups[1].options[0].id.clone()]
        )
        .is_ok());
        assert!(
            validate_selection(&plan, &[red, plan.steps[0].groups[0].options[0].id.clone()])
                .is_err()
        );
        assert!(validate_selection(&plan, &["not-an-option".into()]).is_err());
        fs::remove_file(zip_path).expect("remove ZIP fixture");
    }
}
