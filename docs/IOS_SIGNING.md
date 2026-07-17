# iOS release signing

The iOS workflow is disabled until the repository variable `IOS_RELEASE_ENABLED`
is set to `true`. iOS does not allow a launcher to modify, launch, or inspect
another game's private files. The mobile build is therefore a companion for
the library and mod catalogue, not a replacement for the Windows/Linux
launcher.

To produce an installable signed IPA, enrol in the Apple Developer Program and
configure the `io.github.n7t0of.zailon` app identifier, a distribution
certificate, and an Ad Hoc provisioning profile. Add these repository secrets:

- `IOS_CERTIFICATE`: base64-encoded distribution certificate (`.p12`).
- `IOS_CERTIFICATE_PASSWORD`: the certificate export password.
- `IOS_MOBILE_PROVISION`: base64-encoded Ad Hoc provisioning profile.

An Ad Hoc IPA can be installed only on devices registered in the provisioning
profile. For public iPhone distribution, submit the signed build to App Store
Connect instead. Tauri's [iOS signing documentation](https://v2.tauri.app/distribute/sign/ios/)
describes the required Apple setup.
