const makeCall = async (client, from, to, sendDigits, url) => {
  const call = await client.calls
    .create({ from, to, sendDigits, url });
  return call.sid;
};

module.exports = {
  makeCall
}