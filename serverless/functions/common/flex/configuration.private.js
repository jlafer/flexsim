const axios = require('axios');

const configUrl = 'https://flex-api.twilio.com/v1/Configuration';

function setConfigData(context) {
  return {
    auth: {
      username: context.ACCOUNT_SID,
      password: context.AUTH_TOKEN,
    }
  }
}

async function fetchConfiguration(context) {
  try {
    const netConfig = setConfigData(context);
    const response = await axios.get(configUrl, netConfig);
    return { success: true, status: 200, configuration: response?.data };
  } catch (error) {
    return { success: false, status: (error.response) ? error.response.status : 'Unknown', parameters };
  }
};


exports.fetchDemoMetadata = async function fetchDemoMetadata(parameters) {
  const { context, demoName } = parameters;
  try {
    const response = await fetchConfiguration(context);
    const { configuration } = response;
    const demoMetadata = configuration?.ui_attributes?.custom_data?.flexsim[demoName];
    return { success: true, status: 200, demoMetadata };
  } catch (error) {
    return { success: false, status: (error.response) ? error.response.status : 'Unknown', parameters };
  }
};

exports.updateDemoMetadata = async function fetchDemoMetadata(parameters) {
  const { context, demoName, metadataUpdate } = parameters;
  try {
    let response = await fetchConfiguration(context);
    const { configuration } = response;
    const newConfiguration = R.assocPath(
      ['configuration', 'ui_attributes', 'custom_data', 'flexsim', demoName],
      metadataUpdate,
      configuration
    )
    const netConfig = setConfigData(context);
    response = await axios.post(configUrl, newConfiguration, netConfig);
    return { success: true, status: 201 };
  } catch (error) {
    return { success: false, status: (error.response) ? error.response.status : 'Unknown', parameters };
  }
};
