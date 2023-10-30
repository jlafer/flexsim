const { log } = require('./util');

const makeCall = async ({ client, from, to, sendDigits, connectedUrl, statusUrl }) => {
  const call = await client.calls
    .create({ from, to, sendDigits, url: connectedUrl, statusCallback: statusUrl, statusCallbackEvent: ['completed'] });
  return call.sid;
};

const updateCallTwiML = (client, callSid, twiml) => {
  client.calls(callSid)
    .update({ twiml });
};

const hangupCall = (client, callSid) => {
  client.calls(callSid)
    .update({ status: 'completed' });
};

const removeRecordings = async (ctx) => {
  const { args, cfg, client } = ctx;
  const { metadata } = cfg;
  const { customers } = metadata;

  const callSids = await fetchSimCalls(client, customers.customersPhone, args.fromDt, args.toDt);
  if (callSids.length > 200) {
    log('Sorry - attempting to delete too many recordings. Use an earlier date.')
    return;
  }
  if (callSids.length > 0)
    log(`found ${callSids.length} calls with recordings to remove`)
  for (let i = 0; i < callSids.length; i++) {
    await removeRecordingsForCall(client, callSids[i]);
  }
}

const fetchSimCalls = async (client, fromNumber, fromDt, toDt) => {
  const [yr, mo, day] = getYrMoDayFromStr(fromDt);
  const [endYr, endMo, endDay] = getYrMoDayFromStr(toDt);
  const startTimeAfter = new Date(Date.UTC(yr, mo, day, 0, 0, 0));
  const startTimeBefore = new Date(Date.UTC(endYr, endMo, endDay, 0, 0, 0));
  const calls = await client.calls.list({ from: fromNumber, startTimeAfter, startTimeBefore });
  log(`examining ${calls.length} calls to find recordings`);
  return calls
    .map(c => c.sid);
};

const removeRecordingsForCall = async (client, callSid) => {
  log(`removing recordings for call ${callSid}`);
  const recordings = await client.recordings.list({ callSid });
  for (let i = 0; i < recordings.length; i++) {
    const sid = recordings[i].sid;
    await client.recordings(sid).remove();
    log(`  removed recording ${sid}`);
  }
};

const getYrMoDayFromStr = (yrMoDayStr) => {
  const [yrStr, mo1IdxStr, dayStr] = yrMoDayStr.split('-');
  const yr = (yrStr.length === 2) ? parseInt(yrStr) + 2000 : parseInt(yrStr);
  const mo = parseInt(mo1IdxStr) - 1;
  const day = parseInt(dayStr);
  return [yr, mo, day];
};

module.exports = {
  makeCall,
  hangupCall,
  removeRecordings,
  updateCallTwiML
}