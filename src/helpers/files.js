const fs = require('fs');

function readTextFile(path) {
  return new Promise(function (resolve, reject) {
    fs.readFile(path, 'utf8',
      function (err, text) {
        if (err) reject(err);
        resolve(text);
      }
    );
  });
}

function readJsonFile(path) {
  return readTextFile(path)
    .then(function (text) {
      return new Promise(function (resolve, reject) {
        let data;
        try {
          data = JSON.parse(text);
        }
        catch (err) {
          reject(err);
        }
        resolve(data);
      });
    })
}

function writeToTextFile(path, str) {
  return new Promise(function (resolve, reject) {
    fs.writeFile(path, str,
      function (err) {
        if (err) reject(err);
        resolve(null);
      }
    );
  });
}

function writeToJsonFile(path, value) {
  const str = JSON.stringify(value, null, 2);
  return writeToTextFile(path, str);
}

module.exports = {
  readJsonFile,
  readTextFile,
  writeToJsonFile,
  writeToTextFile
}