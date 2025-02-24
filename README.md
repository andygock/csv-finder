# CSV Finder

This application allows you to upload a CSV/TSV file data, filter its contents, and highlight matching results.

## Features

- Drag and drop a CSV or TSV file, or paste contents to upload and parse its contents.
- Filter the CSV data using a text input field.
- Supports multiple filter tokens separated by spaces.
- Highlights matching text in the table.
- Click on any cell to copy its content to the clipboard.

## Usage

1. Drag and drop a CSV file into the designated area or paste contents into paste field. Compatible with copy and pasting from spreadsheets.
2. Use the input field to filter the data. You can enter multiple tokens separated by spaces to find matches in any order.
3. Click on any cell to copy its content to the clipboard.

If using auto delimiter detection, if the first row includes a tab character, the file will be parsed as TSV. Otherwise, it will be parsed as CSV.

## Development

1. Clone the repository.
2. Install dependencies using `pnpm install`.
3. Start the development server using `pnpm dev`.
