var gulp = require('gulp');
var Hexo = require('hexo');
var inlinesource = require('gulp-inline-source');
var pump = require('pump');
var del = require('del');
var rename = require("gulp-rename");
var vinylPaths = require('vinyl-paths');
var uglify = require('gulp-uglify');
var htmlmin = require('gulp-htmlmin');
var htmlclean = require('gulp-htmlclean');
var minifyCss = require('gulp-clean-css');
var imagemin = require('gulp-imagemin');
var pngquant = require('imagemin-pngquant');
var replace = require('gulp-replace');
var jpegrecompress = require('imagemin-jpeg-recompress');
var jpegtran = require('imagemin-jpegtran');
var yaml = require('yamljs');
var URL = require('url-parse');
var autoprefixer = require('gulp-autoprefixer');
var browserify = require('gulp-browserify');
var request = require('request');

var hexo = new Hexo(process.cwd(), {});


inhex = hexo.init();

function exec_hexo(fn, args, cb) {
  inhex.then(() => hexo.call(fn, args))
      .then(() => hexo.exit())
      .then(() => cb())
      .catch((err) => {
        console.log(err);
        hexo.exit(err);
        return cb(err);
      });
};

// gulp.task('ifttt-webhook', (cb) => {
//   var url = "https://maker.ifttt.com/trigger/blog-deployed/with/key/";
//   return request({url : url + process.env.IFTTT_KEY, method : 'POST'},
//                  (err, resp, body) => { console.log(body); });
// });

gulp.task('hexo-deploy', (cb) => { exec_hexo('deploy', {}, cb); });

gulp.task('purge-cf-cache', (cb) => {
   return request.post({
          url: 'https://api.cloudflare.com/client/v4/zones/' + process.env.CF_ZONE_ID + '/purge_cache',
          headers: {
                   'X-Auth-Email': process.env.CF_EMAIL,
                   'X-Auth-Key': process.env.CF_AUTH_KEY,
                   'Content-Type': 'application/json'
                 },
          body: JSON.stringify({'purge_everything': true})
        }).on('response', function(resp) {
               if (resp.statusCode != 200) {
                  console.error("unable to purge cloudflare cache: " + resp.statusCode)
               }
             });
});

gulp.task('hexo-clean', (cb) => { exec_hexo('clean', {}, cb); })

gulp.task('hexo-generate',
          (cb) => { exec_hexo('generate', {watch : false}, cb); })

gulp.task('js-compress', (cb) => {
  pump([ gulp.src('./public/**/*.js'), uglify(), gulp.dest('./public') ], cb);
});

gulp.task('css-compress', (cb) => {
  pump(
      [
        gulp.src('./public/**/*.css'), autoprefixer(),
        minifyCss({debug : false, level : 1, rebase : false},
                  (details) => {
                    console.log(details.name + ': ' +
                                details.stats.originalSize + ' => ' +
                                details.stats.minifiedSize);
                  }),
        gulp.dest('./public')
      ],
      cb);
});

gulp.task('html-compress', (cb) => {
  pump(
      [
        gulp.src('./public/**/*.html'), htmlclean(), htmlmin({
          minifyJS : true,
          minifyCSS : true,
          minifyURLs : true,
          removeComments : true,
          removeRedundantAttributes : true,
          sortAttributes : true,
          sortClassName : true
        }),
        gulp.dest('./public')
      ],
      cb);
});

gulp.task('image-compress', (cb) => {
  pump(
      [
        gulp.src('./public/images/**/*.+(jpg|jpeg|gif|png|svg)'), imagemin([
          imagemin.gifsicle({interlaced : true}),
          imagemin.svgo({plugins : [ {removeViewBox : true} ]}),
          pngquant({speed : 1, quality : [0.7, 0.8], verbose : true}),
          jpegtran({progressive : true}), jpegrecompress({
            method : 'ssim',
            accurate : true,
            progressive : true,
            strip : true,
            target : 0.80,
            loops : 6
          })
        ]),
        gulp.dest('./public/images')
      ],
      cb);
});

gulp.task('inline-css', () => {
  return gulp.src('./public/**/*.html')
      .pipe(inlinesource({compress : true, rootpath : 'public'}))
      .pipe(gulp.dest('./public'));
});

gulp.task('google-verification', (cb) => {
  return gulp.src("./public/google010b2effcd572c56")
      .pipe(vinylPaths(del))
      .pipe(rename("./public/google010b2effcd572c56.html"))
      .pipe(gulp.dest("./"));
});

gulp.task('text-compress', gulp.series(gulp.parallel('js-compress',
                                                     'css-compress',
                                                     'html-compress'),
                                       'inline-css'));

gulp.task('compress', gulp.parallel('text-compress', 'image-compress'));

gulp.task('fix-css-font-path', () => {
  var url = yaml.load('_config.yml').url;
  return gulp.src('./public/css/fonts.css')
      .pipe(replace(/\.\.\/fonts/g, url + '/fonts'))
      .pipe(gulp.dest('./public/css'));
});

gulp.task('browserify', (cb) => {
  pump(
      [
        gulp.src('./public/js/bootstrap.js'),
        browserify({insertGlobals : true, debug: false}), uglify(),
        gulp.dest('./public/js')
      ],
      cb);
});

gulp.task('build', gulp.series('hexo-clean',
                               'hexo-generate',
                               gulp.series('browserify',
                                              'fix-css-font-path')));

gulp.task('default', gulp.series('build', 'text-compress'));

gulp.task('pre-deploy', gulp.series('build', 'compress', 'google-verification'));

gulp.task('post-deploy', gulp.series('purge-cf-cache'));

gulp.task('deploy',gulp.series('pre-deploy', 'hexo-deploy', 'post-deploy'));

// gulp.task('post-deploy',
//           (cb) => {runSequence([ 'purge-cf-cache', 'ifttt-webhook' ], cb)});

