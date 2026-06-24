const js = require("@eslint/js");
const globals = require("globals");

module.exports = [
  js.configs.recommended, // Включаем базовые правила (поиск ошибок, опечаток)
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.browser, // Разрешаем window, document, alert и т.д.
        ...globals.node     // Разрешаем process, require, module
      }
    },
    rules: {
      "no-unused-vars": "warn", // Предупреждать, если переменная создана, но не используется
      "no-console": "off"       // Разрешить использование console.log
    }
  }
];
