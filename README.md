Kuyy Scrapper

Kuyy Scrapper is a data extraction tool designed to collect insights, trends, and activity distributions from Kuyy, which a  platform where Indonesian users can explore and join various sports activities such as tennis, padel, and more.
This tool helps you quickly understand what’s happening on Kuyy through structured data and simple automation.

🚀 Features
Activity Scraping
Retrieves the latest sports activities listed on Kuyy.

Trend & Distribution Insights
- Provides an overview of activity popularity, participation patterns, and location distribution.
- Automatic Geolocation (Nominatim)
- Performs basic geocoding for spatial analysis.
(Note: currently limited and being improved.)

⚠️ Disclaimer
This project is still a work in progress.
Known limitations include:
- Proxy handling is unstable and may interrupt scraping.
- The geolocation system uses Nominatim, which can be slow or fail due to server-side restrictions.

Feel free to report issues or suggest improvements — contributions are always welcome.

🛠️ Usage
The simplest way to use Kuyy Scrapper is via Apify.
No setup required — just run it directly through PowerShell:

cd <your-project-path>
apify run -p


Apify will take care of the entire workflow automatically.
If you prefer manual execution, you can still run it locally by installing dependencies and running the script — but using Apify is strongly recommended for the smoothest experience.

🌱 Roadmap
- Improve proxy reliability
- Enhance geocoding performance and accuracy
- Add visualization/dashboard support

Introduce advanced filters and authentication

🤝 Contributing
- Contributions are welcome!
- Feel free to open issues, submit pull requests, or share suggestions to help improve the tool.
