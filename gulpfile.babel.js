"use strict";

import { src, dest, watch, series, parallel } from "gulp";
import fs from "fs";
import through from "through2";
import yargs from "yargs";
import yaml from "js-yaml";
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
import modernizrConfig from "../../../config/modernizr-config.json";

import pkg from "../../../package.json";

// Define environment.
const prod = yargs.argv.prod;

// Load Gulp config file.
function loadConfig() {
  const ymlFile = fs.readFileSync("config/gulpconfig.yml", "utf8");
  return yaml.load(ymlFile);
}
const config = loadConfig();
module.exports = config;

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
      console.log(config.vendors.notification);
      resolve();
    });
  }

  return src(
    vendors.map(dependency => "./node_modules/" + dependency + "/**/*.*"),
    {
      base: "./node_modules/",
    }
  ).pipe(dest("src/vendors"));
};

// JS task
export const js = done => {
  src("src/js/custom.js")
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
  src(["src/js/main.js", "src/js/util.js"])
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
  src(["src/sass/custom.scss", "src/sass/main.scss", "src/sass/noscript.scss"])
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
    .pipe(dest(config.sass.dest))
    .pipe($.when(!prod, sync.stream()));
  done();
};

// Generate critical CSS.
task("critical", () => {
  process.setMaxListeners(0);
  return src("_site/**/*.html")
    .pipe(
      $.when(
        !prod,
        criticalCSS({
          base: "_site/",
          inline: false,
          css: ["_site/assets/styles/kubix.css"],
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
    .pipe(dest("_site/assets/styles/critical"));
});

// Compress images
export const images = done => {
  src("src/images/*")
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
task("serve", done => {
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
      server: syncServer,
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
    ["./**/*.html", "./**/*.md", "*.yml", "assets/**/*", "netlify.toml"],
    series("jekyll", reload)
  );
  watch("src/**/*.js")
    .on("add", series("scripts"))
    .on("change", series("scripts"));
  watch("src/**/*.scss")
    .on("add", series("styles"))
    .on("change", series("styles"));
  watch("src/images/*")
    .on("add", series("images"))
    .on("change", series("images"));
});
