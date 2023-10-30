const R = require('ramda');

/*
    Data
      { key: [ixnId],
        data: {
          taskStatus: ['initiated', 'reserved'],
          taskSid,
          ixnValues: dimValues,
          attributes: [subset of dimValues that are task attributes],
          customer,
          workerSid,
        },
        itemTtl: 240
      }
*/

function createSyncMap(client, svcSid, name) {
  return client.sync.v1.services(svcSid)
    .syncMaps
    .create({ uniqueName: name })
}

function getOrCreateSyncMap(client, svcSid, name) {
  console.log('getting sync map:', svcSid);
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
    const { code } = err;
    if (code === 54208) {
      const { key, data, itemTtl } = item;
      return client.sync.v1.services(svcSid)
        .syncMaps(syncMapSid)
        .syncMapItems(key)
        .update({ data, itemTtl });  
    }
    console.error('createSyncMapItem: error:', err);
    throw new Error(err);
  }
}

function getSyncMapItem(context, key) {
  const { args, client, syncMap } = context;
  return client.sync.v1.services(args.syncSvcSid)
    .syncMaps(syncMap.sid)
    .syncMapItems(key)
    .fetch()
}

function updateSyncMapItem(context, key, data) {
  const { args, client, syncMap } = context;
  return client.sync.v1.services(args.syncSvcSid)
    .syncMaps(syncMap.sid)
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