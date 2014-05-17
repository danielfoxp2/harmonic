var fs = require('fs');
var marked = require('marked');
var path = './src/posts/';
var markextra = require('markdown-extra');
var _ = require('underscore');
var nunjucks = require('nunjucks');
var co = require('co');
var Promise = require('promise');
var ncp = require('ncp').ncp;

var Parser = function () {

	this.start = function () {
		return new Promise(function (resolve, reject) {
			resolve('starting the parser');
		});
	};

	this.generateIndex = function (postsMetadata) {
		return new Promise(function(resolve, reject) {
			var curTemplate = GLOBAL.config.template;
			var indexTemplate = fs.readFileSync('./src/templates/' + curTemplate + '/index.html');
			var indexTemplateNJ = nunjucks.compile(indexTemplate.toString());
			var indexContent = '';
			indexContent = indexTemplateNJ.render({ posts : postsMetadata, config : GLOBAL.config });

			/* write index html file */
			fs.writeFile('./public/index.html', indexContent, function (err) {
				if (err) throw err;
				console.log('Successefuly generate index html file');
				resolve(postsMetadata);
			});
		});
	};

	this.copyResources = function () {
		return new Promise(function (resolve, reject) {
			var curTemplate = './src/templates/' + GLOBAL.config.template;
			ncp(curTemplate + '/resources', './public', function (err) {
				if (err) {
					reject(err);
					return;
				}
				resolve('Resources copied');
			});
		});
	};

	this.generatePosts = function(postsMetadata) {
		return new Promise(function(resolve, reject) {
			var curTemplate = GLOBAL.config.template;
			postsMetadata.forEach(function (metadata, i) {
				fs.readFile(metadata.file, function (err, data) {
					var postsTemplate = fs.readFileSync('./src/templates/' + curTemplate + '/post.html');
					var postsTemplateNJ = nunjucks.compile(postsTemplate.toString());
					var markfile = data.toString();
					var _post = {
						content : marked(markfile),
						metadata : metadata
					}
					var postHTMLFile = postsTemplateNJ.render({ post : _post, config : GLOBAL.config });					

					/* Removing header metadata */
					postHTMLFile = postHTMLFile.replace(/<!--[\s\S]*?-->/g, '');

					/* write post html file */
					fs.writeFile('./public/' + metadata.filename + '.html', postHTMLFile, function (err) {
						if (err) throw err;
						console.log('Successefuly generate post html file ' + metadata.filename);
						resolve(postsMetadata);
					});
				});
			});
		});
	};

	this.getFiles = function() {
		return new Promise(function (resolve, reject) {

			/* Reading posts dir */
			fs.readdir(path, function (err, files) {
				if (err) {
					throw err;
				}

				resolve(files);
			});
		});
	};

	this.getConfig = function() {
		return new Promise(function (resolve, reject) {
			var config = fs.readFileSync( "./config.json").toString();
			resolve(JSON.parse(config));
		});
	};

	this.getMarkdownMetadata = function(data) {
		var posts = [];
		return new Promise(function (resolve, reject) {
			var curTemplate = GLOBAL.config.template;
			data.forEach(function (file, i) {
				var post = fs.readFileSync( path + "/" + file).toString();
				var postsTemplate = fs.readFileSync('./src/templates/' + curTemplate + '/post.html');
				var postsTemplateNJ = nunjucks.compile(postsTemplate.toString());
				var markfile = post.toString();
				var filename = file.split('.md')[0];

				/* Markdown extra */
				var metadata = markextra.metadata(markfile, function (md) {
					var retObj = {};
					md.split('\n').forEach(function(line) {
						var data = line.split(':');
						retObj[data[0].trim()] = data[1].trim();
					});
					return retObj;
				});
				metadata['file'] = path + file;
				metadata['filename'] = filename;
				metadata['link'] = '/' + filename + '.html';
				posts.push(metadata);

				if (i === data.length - 1) {
					resolve(posts);
				}
			});
		});
	};
}

module.exports = Parser;