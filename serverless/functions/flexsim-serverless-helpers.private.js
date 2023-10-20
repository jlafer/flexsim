async function fetchIxnData(context, mapName, ixnId) {

  const twilioClient = context.getTwilioClient();
  const response = new Twilio.Response();
  response.appendHeader("Content-Type", "application/json");

  const item = await twilioClient.sync.services(context.SYNC_SVC_SID)
    .syncMaps(mapName)
    .syncMapItems(ixnId)
    .fetch();
  //console.log(`fetchIxnData: returning ${mapName} syncmap item for ${item.key}:`, item.data);
  return item.data;
};

exports.fetchIxnData = fetchIxnData;
