const makeCall = async ({ client, from, to, sendDigits, connectedUrl, statusUrl }) => {
  const call = await client.calls
    .create({ from, to, sendDigits, url: connectedUrl, statusCallback: statusUrl, statusCallbackEvent: ['completed'] });
  return call.sid;
};

const hangupCall = (client, callSid) => {
  client.calls(callSid)
    .update({ status: 'completed' });
};

module.exports = {
  makeCall,
  hangupCall
}