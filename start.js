var child_process = require('child_process');

child_process.execFile('./node/bin/node', ['app.js'], {env: {'PROD': 1}}, function(error, stdout, stderr){
  if (error) {
    throw error;
  }
  console.log(stdout);
});