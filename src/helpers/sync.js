const R = require('ramda');

function createSyncMap(client, svcSid, name) {
  return client.sync.v1.services(svcSid)
    .syncMaps
    .create({ uniqueName: name })
}

function getOrCreateSyncMap(client, svcSid, name) {
  return getSyncMapByName(client, svcSid, name)
    .then(map => {
      return (!!map) ? map : createSyncMap(client, svcSid, name);
    })
}

function getSyncMapByName(client, svcSid, name) {
  return client.sync.v1.services(svcSid).syncMaps.list()
    .then(syncMaps => syncMaps.find(map => map.uniqueName === name))
}

function removeSyncMap(client, svcSid, syncMap) {
  client.sync.v1.services(svcSid)
    .syncMaps(syncMap.sid)
    .remove()
}

async function createSyncMapItem(client, svcSid, syncMapSid, item) {
  try {
    const mapItem = await client.sync.v1.services(svcSid)
      .syncMaps(syncMapSid)
      .syncMapItems
      .create(item);
    return mapItem;
  }
  catch (err) {
    console.log('createSyncMapItem: error:', err);
    const { key, data, itemTtl } = item;
    return client.sync.v1.services(svcSid)
      .syncMaps(syncMapSid)
      .syncMapItems(key)
      .update({ data, itemTtl });
  }
}

function getSyncMapItem(client, svcSid, syncMapSid, key) {
  return client.sync.v1.services(svcSid)
    .syncMaps(syncMapSid)
    .syncMapItems(key)
    .fetch()
}

function updateSyncMapItem(client, svcSid, syncMapSid, key, data) {
  return client.sync.v1.services(svcSid)
    .syncMaps(syncMapSid)
    .syncMapItems(key)
    .update(data)
}

function setSyncMapItem(client, svcSid, syncMapSid, item) {
  return updateSyncMapItem(client, svcSid, syncMapSid, item.key, R.dissoc(['key'], item))
    .catch(_err => {
      return createSyncMapItem(client, svcSid, syncMapSid, item);
    })
    .catch(err => {
      console.error('setSyncMapItem: create failed with:', err);
      return err;
    })
}

module.exports = {
  createSyncMap,
  getOrCreateSyncMap,
  getSyncMapByName,
  createSyncMapItem,
  getSyncMapItem,
  removeSyncMap,
  setSyncMapItem,
  updateSyncMapItem
}