const { src, dest, watch, parallel, series } = require('gulp');

const scss = require('gulp-sass')(require('sass'));
const concat = require('gulp-concat');
const terser = require('gulp-terser');
const clean = require('gulp-clean');
const svgSprite = require('gulp-svg-sprite');
// const replace = require('gulp-replace');
const browserSync = require('browser-sync').create();

// const imagemin = require('gulp-imagemin').default;
const autoprefixer = require('gulp-autoprefixer').default;
const sourcemaps = require('gulp-sourcemaps');
const sharpResponsive = require('gulp-sharp-responsive'); // Плагин для WebP, Сжатия и Retina 1x/2x
const pug = require('gulp-pug');
const htmlmin = require('gulp-htmlmin');

// Переменная, в которой будет временно храниться код спрайта для локального сервера
let devSpriteBuffer = null;

// Очистка папки dist перед сборкой
function cleanDist() {
  return src('dist', { allowEmpty: true, read: false })
    .pipe(clean());
}

// сборка HTML шаблонов через Pug
function htmlCompile() {
  return src(['app/html/*.pug']) // Берем только страницы из корня app/html/
    .pipe(pug({
      pretty: true // Делает HTML читаемым (с правильными отступами), а не минифицирует его
    }))
    .pipe(dest('app')) // Готовый HTML складываем в корень app/ для BrowserSync
    .pipe(browserSync.stream());
}

// Сборка стилей для разработки (в папку app)
function styles() {
  return src('app/scss/style.scss')
    .pipe(sourcemaps.init())
    .pipe(scss({ style: 'expanded' }))
    .pipe(autoprefixer({ overrideBrowserslist: ['last 10 versions'], grid: true })) // Добавляем префиксы
    .pipe(concat('style.min.css'))
    .pipe(sourcemaps.write('.'))
    .pipe(dest('app/css'))
    .pipe(browserSync.stream());
}

// Сборка стилей для продакшена (в папку dist, сжатые)
function stylesBuild() {
  return src('app/scss/style.scss')
    .pipe(scss({ style: 'compressed' }))
    .pipe(autoprefixer({ overrideBrowserslist: ['last 10 versions'], grid: true }))
    .pipe(concat('style.min.css'))
    .pipe(dest('dist/css'));
}

// Сборка и сжатие JS ТОЛЬКО для продакшена (в папку dist)
function scriptsBuild() {
  return src(['app/js/**/*.js'])
    .pipe(terser())
    .pipe(dest('dist/js'));
}

// ОБРАБОТКА РАСТРА ДЛЯ РАЗРАБОТКИ (WebP + Сжатие + Retina 1x/2x)
function imagesDev() {
  return src('raw/images/**/*.{jpg,jpeg,png}', { encoding: false, allowEmpty: true })
    .pipe(sharpResponsive({
      formats: [
        { format: 'webp', jpegOptions: { quality: 75 }, pngOptions: { compressionLevel: 6 }, rename: { suffix: '@2x' } },
        { format: 'webp', width: (metadata) => Math.round(metadata.width / 2), jpegOptions: { quality: 75 }, rename: { suffix: '' } },
        { jpegOptions: { quality: 80 }, pngOptions: { compressionLevel: 6 }, rename: { suffix: '@2x' } },
        { width: (metadata) => Math.round(metadata.width / 2), jpegOptions: { quality: 80 }, rename: { suffix: '' } }
      ]
    }))
    .pipe(dest('app/images'))
    .pipe(browserSync.stream());
}

// ОБРАБОТКА РАСТРА ДЛЯ ПРОДАКШЕНА (Копирует готовые картинки из app в dist)
function imagesBuild() {
  return src(['app/images/**/*', '!app/images/sprite.svg'], {
    base: 'app', encoding: false,
    allowEmpty: true
  })
    .pipe(dest('dist'));
}

// Исправленная генерация SVG-стека для разработки
function spriteDev() {
  return src('raw/icons/**/*.svg')
    .pipe(svgSprite({
      mode: {
        stack: {
          dest: '.',
          sprite: 'sprite.svg'
        }
      },
      shape: {
        id: { generator: '%s' },
        transform: [{
          svgo: {
            plugins: [
              {
                name: 'preset-default',
                params: {
                  overrides: {
                    cleanupIDs: false,
                    removeViewBox: false
                  }
                }
              }
            ]
          }
        }]
      }
    }))
    .on('data', function (file) {
      if (file.path.endsWith('sprite.svg')) {
        devSpriteBuffer = file.contents;
      }
    })
    .on('end', function () {
      browserSync.reload();
    });
}

// Исправленная сборка SVG-стека на продакшен
function spriteBuild() {
  return src('raw/icons/**/*.svg')
    .pipe(svgSprite({
      mode: {
        stack: {
          dest: '.',
          sprite: 'sprite.svg'
        }
      },
      shape: {
        id: { generator: '%s' },
        transform: [{
          svgo: {
            plugins: [
              {
                name: 'preset-default',
                params: {
                  overrides: {
                    cleanupIDs: false,
                    removeViewBox: false
                  }
                }
              }
            ]
          }
        }]
      }
    }))
    .pipe(dest('dist/images'));
}


// Перенос HTML, шрифтов и готового спрайта в папку dist
// Перенос ресурсов в папку dist с минификацией HTML
function building() {
  return src([
    'app/**/*.html',
    'app/css/style.min.css',
    'app/fonts/**/*',
  ], { base: 'app', allowEmpty: true, dot: true, encoding: false })
    .pipe(htmlmin({
      collapseWhitespace: true, // Удаляет все пробелы и переносы строк
      removeComments: true      // Удаляет комментарии из HTML кода
    }))
    .pipe(dest('dist'));
}

// Отслеживание изменений (Watcher)
function watching() {
  watch(['raw/icons/**/*.svg'], spriteDev); // Следим за новой папкой иконок
  watch(['raw/images/**/*.{jpg,jpeg,png}'], imagesDev);      // Следим за новыми картинками в raw
  watch(['app/js/**/*.js']).on('change', browserSync.reload);
  watch(['app/html/**/*.pug'], htmlCompile);
  // watch(['app/js/**/*.js'], series(lintScripts)).on('change', browserSync.reload);
}

// Локальный сервер разработки с Middleware для виртуального спрайта
function browsersync(done) {
  browserSync.init({
    server: {
      baseDir: "app/",
      middleware: [
        function (req, res, next) {
          // Если браузер запрашиваетimages/sprite.svg, отдаем его из памяти
          if (req.url === '/images/sprite.svg' && devSpriteBuffer) {
            res.setHeader('Content-Type', 'image/svg+xml');
            res.end(devSpriteBuffer);
          } else {
            next();
          }
        }
      ]
    },
    notify: false
  });
  done();
}

/* "../images/sprite.svg#btn-burger-close" пример пути чтобы найти картинку в спрайте */


// Экспорт задач
exports.styles = styles;
exports.imagesDev = imagesDev;
exports.spriteDev = spriteDev;
exports.watching = watching;
exports.browsersync = browsersync;

// запуск в терминале командой: gulp
// Сначала готовим картинки и спрайт, затем запускаем стили, сервер и слежение
// Запуск разработки: сначала собираем HTML, картинки и спрайт, затем стили, сервер и слежение
exports.default = series(parallel(htmlCompile, imagesDev, spriteDev), parallel(styles, browsersync, watching));

// запуск для сборки на хостинг gulp build
exports.build = series(cleanDist, spriteBuild, parallel(stylesBuild, scriptsBuild, imagesBuild, building));
