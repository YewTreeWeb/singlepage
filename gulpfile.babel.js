/* ---------------
Required
--------------- */
import { src, dest, watch, series, parallel } from 'gulp'

import yargs from 'yargs'
import autoprefixer from 'autoprefixer'
import cssvariables from 'postcss-css-variables'
import calc from 'postcss-calc'
import rucksack from 'rucksack-css'
import cssnext from 'postcss-cssnext'
import webpack from 'webpack'
import webpackStream from 'webpack-stream'
import named from 'vinyl-named'
import browserSync from 'browser-sync'
import plugins from 'gulp-load-plugins'
import del from 'del'

// Load Gulp Plugins.
const $ = plugins({
  rename: {
    'gulp-group-css-media-queries': 'gcmq',
    'gulp-cloudinary-upload': 'cloudinary',
    'gulp-if': 'when',
    'gulp-clean-css': 'cleanCSS',
  },
  pattern: ['gulp-*', 'gulp.*', '-', '@*/gulp{-,.}*'],
  replaceString: /\bgulp[\-.]/
})

// Set Node Environment.
const prod = yargs.argv.prod

// Create BrowserSync Server.
const sync = browserSync.create()

// Setup Webpack.
const webpackConfig = {
  module: {
    rules: [
      {
        test: /\.js$/,
        loader: 'babel-loader',
        exclude: /node_modules/,
        options: {
          presets: ['@babel/preset-env', 'babel-preset-airbnb'],
          plugins: [
            '@babel/plugin-syntax-dynamic-import',
            '@babel/plugin-transform-runtime'
          ]
        }
      }
    ]
  },
  mode: prod ? 'production' : 'development',
  devServer: {
    historyApiFallback: true
  },
  devtool: !prod ? 'inline-source-map' : false,
  output: {
    filename: '[name].js',
    chunkFilename: '[name].bundle.js'
  },
  externals: {
    jquery: 'jQuery',
  },
  plugins: [
    // Set jQuery in global scope
    // https://webpack.js.org/plugins/provide-plugin/
    new webpack.ProvidePlugin({
      $: 'jquery',
      jQuery: 'jquery',
      cloudinary: 'cloudinary-core'
    })
  ]
}

// Browsersync settings
const syncOptions = {
  // proxy: 'localhost:8888/steelvintage',
  server: 'dist',
  logFileChanges: !prod,
  logLevel: !prod ? 'debug' : '',
  injectChanges: true,
  notify: true,
  open: false,
  ghostMode: {
    clicks: false,
    scroll: false
  },
  plugins: ['bs-console-qrcode']
}

// Function to properly reload your browser.
function reload (done) {
  sync.reload()
  done()
}

/* ---------------
Tasks
--------------- */

// Styling
export const styles = () => {
  return src('src/assets/sass/*.scss')
    .pipe($.plumber())
    .pipe($.changed('dist/assets/css'))
    .pipe($.when(!prod, $.sourcemaps.init()))
    .pipe(
      $.cssimport({
        matchPattern: '*.css'
      })
    )
    .pipe(
      $.sass({
        outputStyle: 'nested'
      }).on('error', $.sass.logError)
    )
    .pipe(
      $.postcss([
        cssnext({
          browsers: ["last 1 version"],
        }),
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
    .pipe($.gcmq())
    .pipe($.csscomb())
    .pipe($.cleanCSS())
    .pipe($.when(!prod, $.uglifycss()))
    .pipe($.when(!prod, $.sourcemaps.write(".")))
    .pipe(dest('dist/assets/css'))
    .pipe($.when(!prod, sync.stream()))
}

// Scripts

export const scripts = () => {
  return (
    src('src/assets/js/*.js')
      .pipe($.plumber())
      .pipe(named())
      // start webpack.
      .pipe(
        webpackStream(webpackConfig),
        webpack
      )
      .pipe($.when(prod, $.uglify()))
      .pipe(dest('dist/assets/js'))
  )
}

// Images
export const images = () => {
  return src('src/assets/images/*.+(jpg|png|svg)')
    .pipe(
      $.plumber()
    )
    .pipe($.changed('dist/assets/images'))
    .pipe($.cache($.imagemin({
      progressive: true,
      interlaced: true
    })))
    .pipe(dest('dist/assets/images'))
}

export const cloudinary = () => {
  return (
    src('dist/assets/images/*.+(jpg|png|svg)')
      .pipe($.plumber())
      .pipe($.changed('/'))
      .pipe(
        $.cloudinary({
          config: {
            cloud_name: 'mat-teague',
            api_key: '925148782699291',
            api_secret: '2pdj9N2gyIvWxOquVwb8jf8WyMo'
          }
        })
      )
      .pipe(
        $.cloudinary.manifest({
          path: 'cloudinary-manifest.json',
          merge: true
        })
      )
      .pipe(dest('/'))
  )
}

export const cloudinaryUse = () => {
  return src('dist/**/*.{html,css}')
    .pipe($.replace('/assets/images/', 'https://res.cloudinary.com/mat-teague/image/upload/c_scale,f_auto,fl_lossy.progressive,w_auto,dpr_auto,q_auto:best/'))
    .pipe(dest('dist'))
} 

// HTML
export const html = () => {
    return src('src/*.html')
    .pipe($.plumber())
    .pipe($.changed('dist'))
    .pipe($.htmlAutoprefixer())
    .pipe($.when(prod, $.htmlmin({
      removeComments: true,
      collapseWhitespace: true,
      collapseBooleanAttributes: false,
      removeAttributeQuotes: false,
      removeRedundantAttributes: false,
      minifyJS: true,
      minifyCSS: true
    })))
    .pipe(dest('dist'))
}

// Fonts
export const fonts = () => {
  return src('src/assets/webfonts/**/*')
    .pipe($.changed('dist/assets/webfonts'))
    .pipe(dest('dist/assets/webfonts'))
}

// BrowserSync
export const serve = done => {
  sync.init(syncOptions)
  done()
}

export const clean = () => del('dist')

export const clear = done => {
  $.cache.clearAll()
  done()
}

// Build Service Worker.
export const buildSW = done => {
  shell.exec('workbox injectManifest workbox-config.js')
  done()
}

// Watch
export const watchForChanges = () => {
  watch('src/assets/sass/**/*.scss')
    .on('add', series(styles))
    .on('change', series(styles))
  watch('src/assets/images/*')
    .on('add', series(images, reload))
    .on('change', series(images, reload))
  watch('src/assets/js/**/*.js')
    .on('add', series(scripts, reload))
    .on('change', series(scripts, reload))
  watch('src/*.html')
    .on('add', series(html, reload))
    .on('change', series(html, reload))
  watch('src/assets/webfonts/*')
    .on('add', series(fonts, reload))
    .on('change', series(fonts, reload))
}

// Default
export const dev = series(
  clean,
  parallel(fonts, html, styles, images, scripts),
  serve,
  watchForChanges
)
export const build = series(
  parallel(clean, clear),
  parallel(fonts, html, styles, images, scripts),
  parallel(cloudinary, cloudinaryUse),
  buildSW
)
export default dev
