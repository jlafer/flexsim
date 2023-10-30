exports.handler = function (context, event, callback) {
  const { mapName, ixnId, startTime, recordingSid } = event;

  const twilioClient = context.getTwilioClient();
  const response = new Twilio.Response();
  response.appendHeader('Content-Type', 'application/json');

  twilioClient.sync.services(context.SYNC_SVC_SID)
    .syncMaps(mapName)
    .syncMapItems(ixnId)
    .fetch()
    .then(item => {
      //console.log(`returning syncmap item for ${item.key}:`, item.data);
      const { customer, attributes, ixnValues } = item.data;
      attributes.ixnId = ixnId;
      attributes.type = 'inbound';
      attributes.name = customer.fullName;
      if (recordingSid) {
        attributes.conversations = {
          'media': [
            {
              'url': `https://api.twilio.com/2010-04-01/Accounts/${context.ACCOUNT_SID}/Recordings/${recordingSid}`,
              'type': 'VoiceRecording',
              'start_time': `${startTime}`,
              'channels': ['customer', 'others']
            }
          ]
        };
      }
      const attrData = {
        customer, attributes
      };
      response.setStatusCode(200);
      response.setBody(attrData);
      callback(null, response);
    })
    .catch(err => {
      console.log(err);
      callback(err);
    });
};
