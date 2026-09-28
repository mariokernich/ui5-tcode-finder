<img src="./logo.png" alt="Logo" width="250"/>

[![CI](https://github.com/mariokernich/ui5-tcode-finder/actions/workflows/ci.yml/badge.svg)](https://github.com/mariokernich/ui5-tcode-finder/actions/workflows/ci.yml)

Welcome to the T-Code Quick Finder project. This application provides a fast and efficient way to search for transaction codes (T-Codes). A live demo is available at [tcodes.kernich.de](https://tcodes.kernich.de).

![Screenshot](screenshot.png)

## Overview

This project is designed to help developers quickly find and manage T-Codes necessary for UI5 and Fiori projects. The application includes features such as search functionality, copy to clipboard, favorite management, custom T-Codes and more.

## Features

- **Search Functionality**: Quickly search for T-Codes by their code, title, or description. The search works together with the group tabs.
- **Copy to Clipboard**: Easily copy T-Codes to the clipboard by clicking on a table row.
- **Copy behavior**: Just copy the T-Code, add an /n or /o prefix (/o while the Shift key is pressed) or open them directly in SAP GUI for HTML (WebGUI).
- **Favorite Management**: Mark T-Codes as favorites to keep them at the top of the list.
- **Add Custom T-Codes**: Add your own T-Codes with descriptions in the CUSTOM group. Use the right click context menu to edit existing ones.
- **Theme Selection**: Choose between light, dark or the theme of your operating system.
- **Group Visibility**: Select which groups of transactions are displayed.
- **Import/Export**: Transfer your settings, favorites and custom T-Codes to another browser.
- **Responsive Design**: Optimized for both desktop and mobile devices.

Favorites and custom T-Codes are stored in the IndexedDB and the settings in the local storage of your browser. No data is sent to a server.

## Demo

A live demo of the application can be accessed at [tcodes.kernich.de](https://tcodes.kernich.de).

## Requirements

- [Node.js](https://nodejs.org/) 22.13 or later, version 24 (LTS) is recommended, see [.nvmrc](.nvmrc)
- [npm](https://www.npmjs.com/) for dependency management

## Installation

To install the dependencies, run:

```sh
npm install
```

## Running the App

To run the app locally for development in watch mode (the browser reloads the app automatically when there are changes in the source code), execute:

```sh
npm start
```

The app will be available at [http://localhost:8080/index.html](http://localhost:8080/index.html).

## Debugging

In the browser, you can directly debug the original TypeScript code, which is supplied via sourcemaps. If the browser doesn't automatically jump to the TypeScript code when setting breakpoints, use `Ctrl`/`Cmd` + `P` in Chrome to open the `*.ts` file you want to debug.

## Building the App

### Unoptimized Build

To build the project and get an app that can be deployed, run:

```sh
npm run build
```

The result is placed into the `dist` folder. To start the generated package, run:

```sh
npm run start:dist
```

### Optimized Build

For an optimized self-contained build, run:

```sh
npm run build:opt
```

To start the generated package, run:

```sh
npm run start:dist
```

## Code Quality

| Command               | Description                                      |
| --------------------- | ------------------------------------------------ |
| `npm run lint`        | Lint the TypeScript code with ESLint             |
| `npm run typecheck`   | Check the types with the TypeScript compiler     |
| `npm run ui5lint`     | Check the app for deprecated or unsafe UI5 usage |
| `npm run test:ui5`    | Run the unit and integration tests with coverage |
| `npm test`            | Run all of the above                             |

The unit tests (QUnit) and the integration tests (OPA5) can also be run in the browser: start the app with `npm start` and open [http://localhost:8080/test/testsuite.qunit.html](http://localhost:8080/test/testsuite.qunit.html). On its first run, the [UI5 Test Runner](https://github.com/ArnaudBuchholz/ui5-test-runner) installs [Puppeteer](https://pptr.dev/) globally to control a headless browser.

## UI5 Version

The app uses the long-term maintenance version OpenUI5 1.148 and loads it from the SAP CDN. When updating the version, change it consistently in [index.html](webapp/index.html), [manifest.json](webapp/manifest.json) (`minUI5Version`), the `ui5*.yaml` files and the `@openui5/types` dependency. Versions are removed from the CDN some time after the end of their maintenance, see the [version overview](https://sdk.openui5.org/versionoverview.html).

## Deployment

Every push to the `main` branch is deployed to [tcodes.kernich.de](https://tcodes.kernich.de) by the [CI workflow](.github/workflows/ci.yml) after linting, type checking, testing and building succeeded.

## License

This project is licensed under the Apache Software License, version 2.0. See the [LICENSE](LICENSE) file for more details.

## Contact

For more information, please contact [Mario Kernich](https://www.linkedin.com/in/mariokernich).

---

Thank you for checking out the UI5/Fiori T-Code Quick Search project. We hope you find it useful for your UI5 and Fiori development needs.
