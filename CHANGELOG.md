# Changelog

## Version 1.2.0

### Fixed

- The table showed only the first 100 transactions, e.g. VA01 or SU01 were missing in the "All" tab
- Searching removed the group filter and switching the group removed the search filter
- Clearing the search showed transactions of all groups, including hidden groups
- A click on a transaction was handled twice and caused an error; in WebGUI mode two windows were opened
- The "New" dialog could not be opened again after it was closed with the Escape key
- Dialogs closed with the Escape key were not destroyed
- The operating system's color scheme overrode an explicitly selected light or dark theme
- The GitHub and LinkedIn icons were invisible in the dark theme after saving the settings with the theme "System"
- Importing settings uploaded the file to the web server
- Importing settings with invalid values made it impossible to save the settings, arbitrary keys were written to the local storage and URLs like `javascript:` were accepted as SAP system URL
- A failed import could delete the custom transactions; the import is atomic now
- Transaction codes were compared case-sensitively, so e.g. "se80" could be added as a custom transaction
- The delete button was enabled without a selection, and after deleting, other transactions could appear selected
- Copy errors (e.g. missing clipboard permission) were not reported
- ST03 was not assigned to any group
- The social media preview images did not exist

### Changed

- Settings are validated when they are loaded or imported; settings of older versions are migrated
- A new "Copy the T-Code with /n prefix" option
- The database stores transaction codes in upper case; existing data is migrated
- The app remains usable without favorites and custom transactions if the browser does not allow storing data
- Custom transactions are validated before saving
- The context menu opens only for custom transactions
- All texts are maintained in the i18n resource bundle
- Improved layout of the header on small screens
- OpenUI5 1.148 (long-term maintenance) is loaded in a fixed version instead of the latest version
- Updated the development tooling (TypeScript 6, ESLint 10, UI5 linter, manifest version 2) and added unit and integration tests
- Deployment runs only after linting, type checking, tests and build succeeded

## Version 1.1.0

- Adding new transactions
- Searching for transactions now changes the count values of each group
- Input of search field changed to uppercase style
- Import and Export function for settings, favorites and custom transactions

## Version 1.0.0

- **Search Functionality**: Quickly search for T-Codes by their code, title, or description.
- **Copy to Clipboard**: Easily copy T-Codes to the clipboard by clicking on a table row.
- **Copy behavior**: Just copy the T-Code, add an /n or /o prefix or open them directly in WebGUI
- **Favorite Management**: Mark T-Codes as favorites and sort them for easy access. Favorites are stored in local storage.
- **Add Custom T-Codes**: Add your own T-Codes with descriptions in the CUSTOM group. Use right click context menu to edit existing ones.
- **Theme Selection**: Choose between light or dark theme.
- **Group Visibility**: Select which transaction should be displayed.
- **Responsive Design**: Optimized for both desktop and mobile devices.
