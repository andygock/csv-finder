# CSV Finder

This application allows you to upload a CSV file, filter its contents, and highlight matching results. It is built using React, TypeScript, and Vite.

## Features

- Drag and drop a CSV file to upload and parse its contents.
- Filter the CSV data using a text input field.
- Supports multiple filter tokens separated by spaces.
- Highlights matching text in the table.
- Click on any cell to copy its content to the clipboard.
- Provides visual feedback using `react-toastify` for clipboard actions.

## Usage

1. Drag and drop a CSV file into the designated area.
2. Use the input field to filter the data. You can enter multiple tokens separated by spaces to find matches in any order.
3. Click on any cell to copy its content to the clipboard.

## Installation

1. Clone the repository.
2. Install dependencies using `pnpm install`.
3. Start the development server using `pnpm dev`.

## Technologies Used

- React
- TypeScript
- Vite
- PapaParse
- React-Toastify
