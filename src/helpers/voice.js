const makeCall = async (client, from, to, url) => {
  const call = await client.calls
    .create({ from, to, url });
  return call.sid;
};

module.exports = {
  makeCall
}