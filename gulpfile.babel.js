"use strict";

import { src, dest, watch, series, parallel } from "gulp";
import yargs from "yargs";
import autoprefixer from "autoprefixer";
import plugins from "gulp-load-plugins";
import browserSync from "browser-sync";
import browserSyncReuseTab from "browser-sync-reuse-tab";
import webpack from "webpack";
import webpackStream from "webpack-stream";
import named from "vinyl-named";
import cssvariables from "postcss-css-variables";
import calc from "postcss-calc";
import rucksack from "rucksack-css";
import critical from "critical";
import shell from "shelljs";

import pkg from "./package.json";

// Define environment.
const prod = yargs.argv.prod;

// Load Gulp Plugins
const $ = plugins({
  rename: {
    "gulp-group-css-media-queries": "gcmq",
    "gulp-sass-glob": "sassGlob",
    "gulp-if": "when",
    "gulp-clean-css": "cleanCSS",
  },
  pattern: ["gulp-*", "*", "-", "@*/gulp{-,.}*"],
  replaceString: /\bgulp[\-.]/,
});

// Create critical css
const criticalCSS = critical.stream;

// Create BrowserSync Server
const sync = browserSync.create();
const reuseTab = browserSyncReuseTab(sync);

// Setup Webpack.
const webpackConfig = {
  module: {
    rules: [
      {
        test: /\.js$/,
        loader: "babel-loader",
        exclude: /node_modules/,
        options: {
          presets: ["@babel/preset-env", "babel-preset-airbnb"],
        },
      },
    ],
  },
  // mode: prod ? 'production' : 'development',
  mode: "development",
  devServer: {
    historyApiFallback: true,
  },
  devtool: !prod ? "inline-source-map" : false,
  output: {
    filename: "[name].js",
    chunkFilename: "[name].bundle.js",
  },
  externals: {
    jquery: "jQuery",
  },
  plugins: [
    // Set libaries in global scope
    // https://webpack.js.org/plugins/provide-plugin/
    new webpack.ProvidePlugin({
      $: "jquery",
      jQuery: "jquery",
      cloudinary: "cloudinary-core",
    }),
  ],
};

/**
 * Tasks
 */

// Call project vendors.
const vendors = Object.keys(pkg.dependencies || {});

export const vendorsTask = () => {
  if (vendors.length === 0) {
    return new Promise(resolve => {
      console.log('No modules found.');
      resolve();
    });
  }

  return src(
    vendors.map(dependency => "./node_modules/" + dependency + "/**/*.*"),
    {
      base: "./node_modules/",
    }
  ).pipe(dest("_src/vendors"));
};

// JS task
export const js = done => {
  src("_src/js/custom.js")
    .pipe($.plumber())
    .pipe(named())
    .pipe(
      webpackStream(webpackConfig),
      webpack
    )
    .pipe(
      $.when(
        !prod,
        $.sourcemaps.init({
          loadMaps: true,
        })
      )
    )
    .pipe(
      $.size({
        showFiles: true,
      })
    )
    .pipe($.when(prod, $.uglify()))
    .pipe(
      $.when(
        prod,
        $.size({
          title: "minified JS",
          showFiles: true,
        })
      )
    )
    .pipe($.when(!prod, $.sourcemaps.write(".")))
    .pipe(dest("assets/js"));
  done();
};

// Combile theme js
export const themeJS = done => {
  src(["_src/js/main.js", "_src/js/util.js", "_src/js/breakpoints.min.js", "_src/js/browser.min.js"])
    .pipe($.plumber())
    .pipe(
      $.size({
        showFiles: true,
      })
    )
    .pipe($.uglify())
    .pipe(
      $.size({
        title: "minified JS",
        showFiles: true,
      })
    )
    .pipe(dest("assets/js"));
  done();
};

// Sass task
export const sass = done => {
  src(["_src/sass/custom.scss", "_src/sass/main.scss", "_src/sass/noscript.scss"])
    .pipe($.plumber())
    .pipe($.when(!prod, $.sourcemaps.init()))
    .pipe(
      $.cssimport({
        matchPattern: "*.css",
      })
    )
    .pipe($.sassGlob())
    .pipe(
      $.sass({
        precision: 10,
        outputStyle: "nested",
      }).on("error", $.sass.logError)
    )
    .pipe(
      $.postcss([
        rucksack({
          fallbacks: true,
        }),
        autoprefixer({
          grid: true,
          cascade: false,
        }),
        cssvariables({
          preserve: true,
        }),
        calc(),
      ])
    )
    .pipe(
      $.size({
        showFiles: true,
      })
    )
    .pipe($.gcmq())
    .pipe($.csscomb())
    .pipe(
      $.cleanCSS({
        advanced: false,
      })
    )
    .pipe($.when(prod, $.when("*.css", $.uglifycss())))
    .pipe(
      $.when(
        prod,
        $.size({
          title: "minified CSS",
          showFiles: true,
        })
      )
    )
    .pipe($.when(!prod, $.sourcemaps.write(".")))
    .pipe($.when(!prod, dest('_site/assets/css')))
    .pipe($.when(!prod, sync.stream()))
    .pipe(dest('assets/css'));
  done();
};

// Generate critical CSS.
export const criticalTask = () => {
  process.setMaxListeners(0);
  return src("_site/**/*.html")
    .pipe(
      $.when(
        !prod,
        criticalCSS({
          base: "_site/",
          inline: false,
          css: ["_site/assets/css/kubix.css"],
          dimensions: [
            {
              height: 568,
              width: 320,
            },
            {
              height: 667,
              width: 365,
            },
            {
              height: 736,
              width: 414,
            },
            {
              height: 812,
              width: 375,
            },
            {
              height: 1024,
              width: 768,
            },
            {
              height: 768,
              width: 1024,
            },
            {
              height: 1024,
              width: 1366,
            },
          ],
          minify: true,
          extract: false,
          ignore: ["@font-face"],
        })
      )
    )
    .on("error", err => {
      log.error(err.message);
    })
    .pipe(dest("_site/assets/css/critical"));
};

// Compress images
export const images = done => {
  src("_src/images/*")
    .pipe($.plumber())
    .pipe(
      $.changed("assets/images", {
        hasChanged: $.changed.compareLastModifiedTime,
      })
    )
    .pipe(
      $.cache(
        $.imagemin([
          $.imagemin.gifsicle({ interlaced: true }),
          $.imagemin.jpegtran({ progressive: true }),
          $.imagemin.optipng(),
          $.imagemin.svgo({ plugins: [{ cleanupIDs: false }] }),
        ])
      )
    )
    .pipe(dest("assets/images"))
    .pipe($.size({ title: "images" }));
  done();
};

// Cloudinary upload
export const cloudinary = done => {
  src('_src/images/*')
    .pipe(cloudinaryUpload({
      config: {
        cloud_name: 'mat-teague',
        api_key: '925148782699291',
        api_secret: '2pdj9N2gyIvWxOquVwb8jf8WyMo'
      }
    }))
    .pipe(cloudinaryUpload.manifest({
      path: '_src/data/cloudinary-manifest.json',
      merge: true
    }))
    .pipe(gulp.dest('_src/data'));
};

// 'gulp jekyll' -- builds your site with development settings
// 'gulp jekyll --prod' -- builds your site with production settings
export const jekyll = done => {
  let JEKYLL_ENV = prod ? "JEKYLL_ENV=production" : "";
  let build = !prod
    ? "jekyll build --verbose --incremental"
    : "jekyll build";
  shell.exec(JEKYLL_ENV + " bundle exec " + build);
  done();
};

// 'gulp doctor' -- literally just runs jekyll doctor
export const siteCheck = done => {
  shell.exec("jekyll doctor");
  done();
};

// Function to properly reload your browser
function reload(done) {
  sync.reload();
  done();
}
// 'gulp serve' -- open up your website in your browser and watch for changes
// in all your files and update them when needed
export const serve = done => {
  let syncPort = 4000;
  let syncPortUi = 4001;
  let syncServer = "_site";
  let syncChanges = true;
  let syncLvl = "debug";
  let syncNotify = true;
  let syncOpen = false;

  sync.init(
    {
      port: syncPort, // change port to match default Jekyll
      ui: {
        port: syncPortUi,
      },
      server:{
        baseDir: syncServer
      },
      logFileChanges: syncChanges,
      logLevel: syncLvl,
      injectChanges: true,
      notify: syncNotify,
      open: syncOpen, // Toggle to automatically open page starting. Do not set to automatically open browser when reuse tab is enable.
      plugins: ["bs-console-qrcode"],
    },
    reuseTab
  );
  done();

  // Watch various files for changes and do the needful
  watch(
    ["./**/*.html", "./**/*.md", "*.yml", "netlify.toml"],
    series(jekyll, reload)
  );
  watch("_src/**/*.js")
    .on("add", series(js, jekyll, reload))
    .on("change", series(js, jekyll, reload));
  watch("_src/**/*.scss")
    .on("add", series(sass))
    .on("change", series(sass));
  watch("_src/images/*")
    .on("add", series(images, jekyll, reload))
    .on("change", series(images, jekyll, reload));
}

export const dev = series(
  vendorsTask,
  parallel(sass, themeJS, js, images),
  jekyll,
  serve
)
export const build = series(
  vendorsTask,
  parallel(sass, themeJS, js, images),
  criticalTask,
  jekyll,
  cloudinary
)
export default dev