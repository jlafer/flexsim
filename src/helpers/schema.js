const Ajv = require('ajv/dist/jtd');

const schema = {
  properties: {
    agentCnt: { type: 'int32' },
    arrivalRate: { type: 'int32' },
    handleTimeBase: { type: 'int32' },
    taskAttributes: {
      properties: {
        arrival: {
          elements: {
            properties: {
              name: { type: 'string' },
              mapping: {
                elements: {
                  type: 'float32'
                }
              }
            },
            optionalProperties: {
              property: { type: 'string' }
            }
          }
        }
      },
    },
    workerAttributes: {
      elements: {
        properties: {
          name: { type: 'string' },
          mapping: {
            elements: {
              type: 'float32'
            }
          }
        },
        optionalProperties: {
          property: { type: 'string' }
        }
      },
    },
    properties: {
      elements: {
        properties: {
          name: { type: 'string' },
          expr: { type: 'string' },
          values: {
            elements: {
              type: 'string'
            }
          }
        },
      },
    },
  },
  optionalProperties: {
    brand: { type: 'string' },
  }
};

const checkAndFillDomain = (domain) => {
  const ajv = new Ajv({ useDefaults: true });
  const validate = ajv.compile(schema);
  const valid = validate(domain);
  return [valid, validate.errors];
}

module.exports = {
  checkAndFillDomain
}