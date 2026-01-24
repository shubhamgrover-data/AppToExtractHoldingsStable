# Web Data Extractor

## Overview

A Node.js web scraping tool that extracts specific data attributes from web pages. The application provides both a web interface and API endpoints for extracting structured data from URLs, with special support for parsing HTML tables into JSON format.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Backend Architecture
- **Framework**: Express.js (v5.1.0) serving as the web server and API layer
- **Entry Point**: `app.js` - handles routing, static file serving, and API endpoints
- **Helper Module**: `helper.js` - contains core scraping logic including:
  - `parseTableToJSON()`: Converts complex HTML tables (with colspan/rowspan) to JSON
  - `extractInsightLogic()`: Main extraction logic for web scraping
- **Worker Threads**: `worker.js` implements parallel URL processing using Node.js worker threads for performance

### Frontend Architecture
- **Location**: `public/` directory served as static files
- **Structure**: Simple vanilla HTML/CSS/JavaScript
  - `public/index.html`: Main UI with form inputs for URL, attribute targeting
  - `public/script.js`: Client-side logic for API calls and result display
  - `public/style.css`: Gradient-based modern styling

### API Design
- `GET /` - Serves the web interface
- `POST /api/extract` - Main extraction endpoint accepting:
  - `urls`: Array of target URLs
  - `attribute`: Target HTML attribute to extract
  - `label`: Optional label for filtering

### Web Scraping Stack
- **Axios**: HTTP client for fetching web pages
- **Cheerio**: Fast HTML parsing and DOM manipulation
- **JSDOM**: Full DOM simulation for complex table parsing
- **Puppeteer**: Available for JavaScript-rendered pages (headless browser)

### Design Decisions
1. **Dual parsing approach**: Uses Cheerio for speed on simple pages, JSDOM for complex table structures requiring full DOM simulation
2. **CORS enabled**: Configured for cross-origin requests with permissive settings
3. **Worker threads**: Parallel URL processing for batch operations
4. **Endpoint mode toggle**: UI supports both formatted display and raw JSON response

## External Dependencies

### NPM Packages
- **express** (v5.1.0): Web framework
- **axios** (v1.11.0): HTTP client for fetching pages
- **cheerio** (v1.1.2): jQuery-like HTML parsing
- **jsdom** (v27.4.0): DOM simulation for complex parsing
- **puppeteer** (v24.15.0): Headless Chrome for JS-rendered content
- **cors** (v2.8.5): CORS middleware

### Runtime Configuration
- **Port**: Configurable via `PORT` environment variable, defaults to 5000
- **Static Files**: Served from `public/` directory