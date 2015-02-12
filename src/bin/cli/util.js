/*jshint unused:false*/
import fs from 'fs';
import path from 'path';
import chokidar from 'chokidar';
import browserSync from 'browser-sync';
import co from 'co';
import prompt from 'co-prompt';
import _ from 'underscore';
import { ncp } from 'ncp';
import open from 'open';
import { rootdir, postspath, pagespath } from '../config';
import { cliColor, getConfig, titleToFilename } from '../helpers';
import { build } from '../core';

export { init, config, newFile, run, openFile };

// Open a file using browser, text-editor
function openFile(type, sitePath, file) {
    if (type === 'file') {
        open(path.resolve(sitePath, file));
    } else {
        // TODO unless we add a --no-watch flag, we can just delegate this to browser-sync
        open(file);
    }
}

// Temporary
// jscs:disable requireCamelCaseOrUpperCaseIdentifiers

function init(sitePath) {
    var skeletonPath = path.normalize(rootdir + '/bin/skeleton'),
        copySkeleton = () => {
            return new Promise((resolve, reject) => {
                ncp(skeletonPath, sitePath, (err) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    resolve('Harmonic skeleton started at: ' + path.resolve('./', sitePath));
                });
            });
        },
        clc = cliColor();

    fs.exists(sitePath, (exists) => {
        if (!exists) {
            fs.mkdirSync(sitePath);
        }
        copySkeleton().then((msg) => {
            console.log(clc.message(msg));
            config(sitePath);
        });
    });
}

function config(sitePath) {
    var clc = cliColor(),
        manifest = sitePath + '/harmonic.json';

    co(function*() {
        console.log(clc.message(
            'This guide will help you to create your Harmonic configuration file\n' +
            'Just hit enter if you are ok with the default values.\n\n'
        ));

        var config,
            templateObj = {
                name: 'Awesome website',
                title: 'My awesome static website',
                domain: 'http://awesome.com',
                subtitle: 'Powered by Harmonic',
                author: 'Jaydson',
                description: 'This is the description',
                bio: 'Thats me',
                template: 'default',
                preprocessor: 'stylus',
                posts_permalink: ':language/:year/:month/:title',
                pages_permalink: 'pages/:title',
                header_tokens: ['<!--', '-->'],
                index_posts: 10,
                i18n: {
                    default: 'en',
                    languages: ['en', 'pt-br']
                }
            };

        function _p(message) {
            return prompt(clc.message(message));
        }

        config = {
            name: (yield _p('Site name: (' + templateObj.name + ') ')) ||
                templateObj.name,
            title: (yield _p('Title: (' + templateObj.title + ') ')) ||
                templateObj.title,
            subtitle: (yield _p('Subtitle: (' + templateObj.subtitle + ') ')) ||
                templateObj.subtitle,
            description: (yield _p('Description: (' + templateObj.description + ') ')) ||
                templateObj.description,
            author: (yield _p('Author: (' + templateObj.author + ') ')) ||
                templateObj.author,
            bio: (yield _p('Author bio: (' + templateObj.bio + ') ')) ||
                templateObj.bio,
            template: (yield _p('Template: (' + templateObj.template + ') ')) ||
                templateObj.template,
            preprocessor: (yield _p('Preprocessor: (' + templateObj.preprocessor + ') ')) ||
                templateObj.preprocessor
        };

        // create the configuration file
        fs.writeFile(manifest, JSON.stringify(_.extend(templateObj, config), null, 4),
            function(err) {
                if (err) {
                    throw err;
                }
                console.log(clc.message(
                    '\nYour Harmonic website skeleton was successfully created!' +
                    '\nNow, browse the project dir and have fun.'
                ));
            }
        );

        process.stdin.pause();

    })();
}

/**
 * @param {string} type - The new file's type. Can be either 'post' or 'page'.
 * @param {string} title - The new file's title.
 */
function newFile(sitePath, type, title, autoOpen) {
    var clc = cliColor(),
        langs = getConfig(sitePath).i18n.languages,
        template = '<!--\n' +
            'layout: ' + type + '\n' +
            'title: ' + title + '\n' +
            'date: ' + new Date().toJSON() + '\n' +
            'comments: true\n' +
            'published: true\n' +
            'keywords:\n' +
            'description:\n' +
            'categories:\n' +
            '-->\n' +
            '# ' + title,
        filedir = path.join(sitePath, type === 'post' ? postspath : pagespath),
        filename = titleToFilename(title);

    langs.forEach((lang) => {
        let fileLangDir = path.join(filedir, lang);
        let fileW = path.join(fileLangDir, filename);
        if (!fs.existsSync(fileLangDir)) {
            fs.mkdirSync(fileLangDir);
        }
        fs.writeFileSync(fileW, template);
        if (autoOpen) {
            openFile('text', sitePath, fileW);
        }
    });

    console.log(clc.info(
        type[0].toUpperCase() + type.slice(1) +
        ' "' + title + '" was successefuly created, check your /src/' + type + 's folder'
    ));
}

function run(sitePath, port, autoOpen) {
    let clc = cliColor();

    return new Promise((fulfill, reject) => {
        browserSync({
            server: {
                baseDir: path.join(sitePath, 'public')
            },
            port,
            open: autoOpen
        }, (err) => {
            if (err) return reject(err);
            // TODO move logging to CLI? (to avoid polluting API)
            console.log(clc.info(`Harmonic site is running on http://localhost:${port}`));
            fulfill();
        });
    }).then(() => {
        let buildPromise = Promise.resolve();
        let buildQueueCount = 0;

        function buildSite() {

            // TODO clean up/explain logic
            if (buildQueueCount === 2) return;

            buildQueueCount++;
            buildPromise = buildPromise
                .then(() => build(sitePath))
                .then(() => {
                    buildQueueCount--;
                    // TODO only reload modified files?
                    browserSync.reload();
                });
        }

        let pathsToWatch = ['src/', 'harmonic.json'].map((p) => path.join(sitePath, p));
        let watcher = chokidar.watch(pathsToWatch, {
            // interval: 1000,
            // TODO compile main.css/whole template outside of project src dir?
            ignored: /[\/\\](?:\.|main\.css)/,
            ignoreInitial: true,
            // ignorePermissionErrors: true,
            cwd: sitePath
        });

        watcher
            .on('add', buildSite)
            .on('addDir', buildSite)
            .on('change', buildSite)
            .on('unlink', buildSite)
            .on('unlinkDir', buildSite)
            .on('error', (error) => { console.error('Error occurred', error); });

        return new Promise((fulfill) => {
            watcher.on('ready', () => {
                // TODO move logging to CLI? (to avoid polluting API)
                console.log(clc.info('Watching Harmonic project for changes...'));
                fulfill({ watcher }); // TODO what else should we return here?
            });
        });
    }).catch((err) => { // TODO move catch/logging to CLI?
        console.error(err);
    });
}
