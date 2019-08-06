const fs = require('fs');
const config = require('./config.json');

var run = function() {
    var migrations_ran = false;

    if (config.prefix === undefined) {
        console.log('Config migration: setting config.prefix = slack');
        config.prefix = 'slack';
        migrations_ran = true;
    }

    // Write modified config file
    if (migrations_ran) {
        fs.writeFile('./config.json', JSON.stringify(config, null, 4), 'utf8', function (err) {
            if (err) {
                console.log('Unable to write new config after migrations.  Please make the above edits manually.');
                throw err;
            }
            console.log('Successfully migrated config.  Please restart the bridge.');
            process.exit()
        })
    }
}

module.exports = {
    run: run
}
