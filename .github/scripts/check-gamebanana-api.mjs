import assert from 'node:assert/strict'

const API = 'https://api.gamebanana.com/Core'

async function json(path, attempt = 1) {
  try {
    const response = await fetch(`${API}${path}`, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(15_000),
    })
    assert.equal(response.ok, true, `GameBanana HTTP ${response.status}`)
    return await response.json()
  } catch (error) {
    if (attempt >= 3) throw error
    await new Promise(resolve => setTimeout(resolve, attempt * 1_000))
    return json(path, attempt + 1)
  }
}

const games = await json('/List/Like?itemtype=Game&field=name&match=Cyberpunk&format=json_min')
assert.ok(Array.isArray(games), 'List/Like must return an array')
const cyberpunk = games.find(game => Number(game?.id) === 8722)
assert.equal(cyberpunk?.name, 'Cyberpunk 2077', 'Cyberpunk 2077 must resolve to GameBanana game 8722')

const recent = await json('/List/New?itemtype=Mod&gameid=8722&page=1&format=json_min&include_updated=0')
assert.ok(Array.isArray(recent) && recent.length > 0, 'List/New must return at least one Cyberpunk mod')
const modIds = recent
  .filter(item => Array.isArray(item) && item[0] === 'Mod' && Number.isInteger(Number(item[1])))
  .slice(0, 2)
  .map(item => Number(item[1]))
assert.ok(modIds.length > 0, 'List/New must expose numeric mod identifiers')

const details = new URLSearchParams({ format: 'json_min' })
for (const modId of modIds) {
  details.append('itemtype[]', 'Mod')
  details.append('itemid[]', String(modId))
  details.append('fields[]', 'name,downloads,Preview().sStructuredDataFullsizeUrl(),screenshots,Url().sProfileUrl()')
  details.append('return_keys[]', 'true')
}
const items = await json(`/Item/Data?${details.toString()}`)
assert.ok(Array.isArray(items) && items.length === modIds.length, 'Item/Data must return one row per requested mod')
for (const item of items) {
  const value = (field, index) => Array.isArray(item) ? item[index] : item?.[field]
  assert.equal(typeof value('name', 0), 'string', 'Each mod must have a name')
  assert.ok(Number(value('downloads', 1)) >= 0, 'Each mod must expose a valid download count')
  assert.equal(typeof value('Url().sProfileUrl()', 4), 'string', 'Each mod must expose its source URL')
  assert.notEqual(value('screenshots', 3), undefined, 'The supported screenshots field must remain available')
}

console.log(`GameBanana contract OK: game #${cyberpunk.id}, ${recent.length} recent mods, ${items.length} detail rows.`)
