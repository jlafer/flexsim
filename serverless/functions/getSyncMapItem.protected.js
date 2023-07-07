exports.handler = function (context, event, callback) {
  const { mapName, key } = event;

  const twilioClient = context.getTwilioClient();
  const response = new Twilio.Response();
  response.appendHeader("Content-Type", "application/json");

  twilioClient.sync.services(context.SYNC_SVC_SID)
    .syncMaps(mapName)
    .syncMapItems(key)
    .fetch()
    .then(item => {
      //console.log(`returning syncmap item for ${item.key}:`, item.data);
      response.setStatusCode(200);
      response.setBody(item.data);
      callback(null, response);
    })
    .catch(err => {
      console.log(err);
      callback(err);
    });
};
