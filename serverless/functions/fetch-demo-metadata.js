const Configuration = require(Runtime.getFunctions()['common/flex/configuration'].path);

exports.handler = async function (context, event, callback) {
  const { demoName } = event;
  const response = new Twilio.Response();
  response.appendHeader('Content-Type', 'application/json');
  try {
    const result = await Configuration.fetchDemoMetadata({
      context, demoName
    });
    response.setStatusCode(201);
    callback(null, result);
  } catch (err) {
    console.log(err);
    callback(err);
  }
}