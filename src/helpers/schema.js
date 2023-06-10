const Ajv = require('ajv');

const schema = {
  type: 'object',
  properties: {
    agentCnt: { type: 'number', default: 15 },
    arrivalGap: {
      type: 'object',
      properties: {
        expr: {
          type: 'string',
          enum: ['enum', 'range', 'identity'],
          default: 'enum'
        },
        curve: {
          type: 'string',
          enum: ['uniform', 'bell'],
          default: 'uniform'
        },
        min: { type: 'number', default: 10 },
        max: { type: 'number', default: 20 }
      }
    },
    talkTime: {
      type: 'object',
      properties: {
        expr: {
          type: 'string',
          enum: ['enum', 'range', 'identity'],
          default: 'enum'
        },
        curve: {
          type: 'string',
          enum: ['uniform', 'bell'],
          default: 'uniform'
        },
        min: { type: 'number', default: 10 },
        max: { type: 'number', default: 40 }
      }
    },
    brand: { type: 'string', default: 'Owl Industries' },
    taskAttributes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          property: { type: 'string' },
          phase: {
            type: 'string',
            enum: ['arrival', 'routing', 'completion']
          },
          mapping: {
            type: 'array',
            items: {
              type: 'number'
            }
          }
        },
        required: ['name']
      }
    },
    workerAttributes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          property: { type: 'string' },
          mapping: {
            type: 'array',
            items: {
              type: 'number'
            }
          }
        },
        required: ['name']
      },
    },
    properties: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          expr: {
            type: 'string',
            enum: ['identity', 'range', 'enum'],
            default: 'identity'
          },
          enum: {
            type: 'array',
            items: { type: 'string' }
          },
          curve: {
            type: 'string',
            enum: ['bell', 'uniform', 'log'],
            default: 'uniform'
          },
        },
        required: ['name']
      },
    },
  },
  additionalProperties: true
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