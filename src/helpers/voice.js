const makeCall = async (client, from, to, sendDigits, url, statusCallback) => {
  const call = await client.calls
    .create({ from, to, sendDigits, url, statusCallback, statusCallbackEvent: ['completed'] });
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