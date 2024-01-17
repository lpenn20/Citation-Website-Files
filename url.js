// uses web scraping to retreive data from websites. analyses this data to find citation information from that website, such as the author, date, etc.

import { fetchUrlApis } from "./urlsSpecifics";
import axios from "axios";
import cheerio from "cheerio";

import nlp from "compromise";
import { fetchVideos } from "./youtube";

export async function fetchUrl(citer) {
  try {
     // Initial type finding based on URLs
  if (citer.api.searchString && citer.api.searchString.includes("youtube.com")) {
    const video = await fetchVideos(citer);

    return video;
  }

  const typeFromUrl = await findTypesFromUrls(citer);

  if (typeFromUrl.api.urlString) {
    const apiResponse = await fetchUrlApis(typeFromUrl);
    if (apiResponse && apiResponse.info) {
      return apiResponse;
    }
  }

  const newCiter = await findType(citer);

  return newCiter;
  } catch (error) {
    console.log(error)
    const source = { ...citer, api: { ...citer.api, missing: true } };
    return source
  }
 
}

const urlTypes = {
  // "encyclopedia-entry": ["britannica", "encyclopedia"],
  "article-newspaper": [
    "tribune",
    "news",
    "nytimes",
    "cnn",
    "bbc",
    "foxnews",
    "msnbc",
    "washingtonpost",
    "news.yahoo",
    "reuters",
    "news.google",
    "aljazeera",
  ],
  // "dictionary-entry": ["dictionary", "webster", "thesaurus"],
  "post-weblog": ["blog"],
  // motion_picture: ["youtube"],
  software: ["github", "npmjs"],
};

async function findTypesFromUrls(citer) {
  const doiNumRegex = /10\.\d{4,9}\/[-._;()/:A-Z0-9]+/i;
  const pmcRegex = /PMC\d+/; // Regex pattern for PMC followed by numbers
  const pubMedRegex = /https:\/\/pubmed\.ncbi\.nlm\.nih\.gov\/(\d+)/; // Pattern for PubMed URL

  const doiMatch = citer.api.searchString.match(doiNumRegex);
  const pmcMatch = citer.api.searchString && citer.api.searchString.match(pmcRegex); // Make sure title exists before attempting match
  const pubMedMatch = citer.api.searchString.match(pubMedRegex);

  // First check for DOI number in URL
  if (doiMatch) {
    citer.api = {
      ...citer.api,
      type: "article",
      urlString: [doiMatch[0]],
    };
    return citer;
  }
  // Check for PubMed URL
  if (pubMedMatch) {
    citer.api = {
      ...citer.api,
      type: "article",
      search:"PM",
      urlString: [pubMedMatch[1]],
    };
    return citer;
  }

  // Next check for PMC in title
  if (pmcMatch) {
    citer.api = {
      ...citer.api,
      type: "article-journal",
   
      urlString: [pmcMatch[0]],
    };
    return citer;
  }
  // If no DOI, PubMed or PMC number is found, compare with urlTypes
  // If no DOI, PubMed or PMC number is found, compare with urlTypes
  for (const [type, domains] of Object.entries(urlTypes)) {
    for (const domain of domains) {
      if (citer.api.searchString.includes(domain)) {
        citer.api = {
          ...citer.api,
          type: type,
        };

        // Check if the type is "software" or "youtube"
        if (type === "software") {
          citer.api.urlString = [citer.api.searchString];
        }
        return citer;
      }
    }
  }

  // If none of the types match
  citer.api = {
    ...citer.api,
    type: null,
  };
  return citer;
}

async function findType(citer) {
  try {
    const response = await axios.get("https://app.scrapingbee.com/api/v1/", {
      params: {
        api_key:
        process.env.SCRAPINGBEE_API_KEY,
        url: citer.api.searchString,
      },
    });

    const $ = cheerio.load(response.data);

    // Initialize values
    citer.api.urlString = citer.api.urlString || [];

    // Fetch meta DOIs and Types
    const { metaDOIs, metaTypes } = fetchMetaDOIAndTypes($);

    // Update citer object
    updateCiterObject(citer, metaDOIs, metaTypes);

    // Handle other Citation Meta
    handleOtherCitationMeta(citer, $, response.data);

    if (citer.api.urlString) {
      const apiResponse = await fetchUrlApis(citer);

      if (apiResponse && apiResponse.info) {
        return apiResponse;
      }
    }
    // Extract additional information
    const additionalInfo = extractAdditionalInfo($);

    return {
      ...citer,
      info: {
        ...additionalInfo, // Spread the properties of additionalInfo directly
        URL: citer.api.searchString,
      },
      api: {
        ...citer.api,
        type: citer.api.type ? citer.api.type : "webpage",
      },
    };
  } catch (error) {
    const source = { ...citer, api: { ...citer.api, missing: true , type:"webpage"} };
    return source
    throw error;
  }
}

function fetchMetaDOIAndTypes($) {
  const doiSelectors = [
    { selector: 'meta[name="citation_pmid"]', type: "PMID" },
    { selector: 'meta[name="citation_doi"]', type: "DOI" },
    { selector: 'meta[name="DC.Identifier"]', type: "DOI" },
    { selector: 'meta[name="citation_isbn"]', type: "ISBN" },
  ];

  const metaDOIs = [];
  const metaTypes = [];

  for (const { selector, type } of doiSelectors) {
    const content = $(selector).attr("content");
    if (content) {
      metaDOIs.push(content);
      metaTypes.push(type);
    }
  }

  return { metaDOIs, metaTypes };
}

function updateCiterObject(citer, metaDOIs, metaTypes) {
  for (let i = 0; i < metaDOIs.length; i++) {
    if (metaTypes[i] === "PMID") {
      citer.api.search = "PM";
    }
    citer.api.urlString.push(metaDOIs[i]);
  }
}

function handleOtherCitationMeta(citer, $, responseData) {
  const otherCitationMeta = $("meta").filter(function () {
    const name = $(this).attr("name");
    return name && name.startsWith("citation_");
  });

  if (otherCitationMeta.length > 0) {
    const doiRegex = /\b10\.\d{4,9}\/[-._;()/:A-Z0-9]+\b/i;
    const matches = responseData.match(doiRegex);
    if (matches) {
      citer.api.type = "article";
      citer.api.urlString.push(matches[0]);
    }
  }
}

function extractAdditionalInfo($) {
  // Replace these with your own extraction logic
  const contributor = fetchAuthor($);
  const publisher = fetchPublisher($);
  const datePublished = fetchDate($);
  const headline = fetchHeadline($);
  const webTitle = fetchWebTitle($);

  return {
    contributor,
    publisher,
    title: headline,
    issued: datePublished,
    "container-title": webTitle,
  };
}

const authorSelectors = [
  { selector: 'meta[name="author"]', attr: "content" },
  { selector: ".author-name", attr: "innerText" },
  { selector: ".byline", attr: "innerText" },
  { selector: ".entry-author-name", attr: "innerText" },
  { selector: ".post-author", attr: "innerText" },
  { selector: ".author", attr: "innerText" },
  { selector: ".article-author", attr: "innerText" },
  { selector: ".posted-by", attr: "innerText" },
  { selector: ".author-link", attr: "innerText" },
  { selector: ".author-info", attr: "innerText" },
  { selector: ".author-details", attr: "innerText" },
  { selector: ".post-meta-author", attr: "innerText" },
  { selector: ".author-box-name", attr: "innerText" },
  { selector: ".author-box-title", attr: "innerText" },
  { selector: ".author-box-content", attr: "innerText" },
  { selector: ".authorByline", attr: "innerText" },
  { selector: ".authorCredit", attr: "innerText" },
  { selector: ".authorInfo", attr: "innerText" },
  { selector: ".postAuthor", attr: "innerText" },
  { selector: ".postAuthorName", attr: "innerText" },
  { selector: ".articleAuthor", attr: "innerText" },
  { selector: ".articleAuthorName", attr: "innerText" },
  { selector: ".authorBy", attr: "innerText" },
  { selector: ".byAuthor", attr: "innerText" },
  { selector: ".writtenBy", attr: "innerText" },
  { selector: "span.topic-identity__name", attr: "innerText" },
  { selector: 'meta[name="dc.Creator"]', attr: "content" },
];

const dateSelectors = [
  { selector: "time", attr: "datetime" },
  { selector: ".timestamp", attr: "content" },
  { selector: ".date", attr: "content" },
  { selector: ".datetime", attr: "content" },
  { selector: ".published", attr: "content" },
  { selector: ".pubdate", attr: "content" },
  { selector: "meta[name='date']", attr: "content" },
  { selector: "meta[property='article:published_time']", attr: "content" },
  { selector: "meta[itemprop='datePublished']", attr: "content" },
  { selector: ".post-date", attr: "content" },
  { selector: ".post-date", attr: "innerText" },
  { selector: ".entry-date", attr: "content" },
  { selector: ".entry-date", attr: "innerText" },
  { selector: "time.topic-identity__publish-date", attr: "dateTime" },
  { selector: 'meta[name="dc.Date"]', attr: "content" },
];

const publisherSelectors = [
  { selector: 'meta[name="publisher"]', attr: "content" },
  { selector: ".publisher", attr: "innerText" },
  { selector: ".site-publisher", attr: "innerText" },
  { selector: ".byline-publisher", attr: "innerText" },
  { selector: ".post-publisher", attr: "innerText" },
  { selector: ".news-publisher", attr: "innerText" },
  { selector: "#publisher", attr: "innerText" },
  { selector: ".article-publisher", attr: "innerText" },
  { selector: ".sitePublisher", attr: "innerText" },
  { selector: ".websitePublisher", attr: "innerText" },
  { selector: ".pagePublisher", attr: "innerText" },
  { selector: ".contentPublisher", attr: "innerText" },
  { selector: ".publisherName", attr: "innerText" },
  { selector: ".postPublisherName", attr: "innerText" },
  { selector: ".articlePublisherName", attr: "innerText" },
  { selector: "#publisherName", attr: "innerText" },
  { selector: ".headerPublisher", attr: "innerText" },
  { selector: ".footerPublisher", attr: "innerText" },
  { selector: ".mainPublisher", attr: "innerText" },
  { selector: ".publisher-name", attr: "innerText" },
  { selector: ".publisher-tag", attr: "innerText" },
  { selector: ".publisher-label", attr: "innerText" },
  { selector: ".publisher-title", attr: "innerText" },
  { selector: 'meta[name="dc.Publisher"]', attr: "content" },
];

const webTitleSelectors = [
  { selector: 'meta[name="site_name"]', attr: "content" },
  { selector: 'meta[property="og:site_name"]', attr: "content" },
  { selector: 'meta[name="application-name"]', attr: "content" },
  { selector: ".site-title", attr: "innerText" },
  { selector: ".site-name", attr: "innerText" },
  { selector: ".brand", attr: "innerText" },
  { selector: ".navbar-brand", attr: "innerText" },
  { selector: "#site-title", attr: "innerText" },
  { selector: "#site-name", attr: "innerText" },
  { selector: "header.site-header", attr: "innerText" },
];

const articleTitleSelectors = [
  { selector: 'meta[name="title"]', attr: "content" },
  { selector: 'meta[property="og:title"]', attr: "content" },
  { selector: 'meta[name="twitter:title"]', attr: "content" },
  { selector: "h1.post-title", attr: "innerText" },
  { selector: "h1.content-title__text", attr: "innerText" },
  { selector: 'h1[data-testid="post-title"]', attr: "innerText" },
  { selector: "h1.entry-title", attr: "innerText" },
  { selector: ".article-title__title", attr: "innerText" }, // Add this line for Encyclopedia.com
  { selector: 'meta[name="dc.Title"]', attr: "content" },
  { selector: "h1.topic-identity__title", attr: "innerText" },
];

function fetchDataFromSelectors($, selectors) {
  for (const { selector, attr } of selectors) {
    const els = $(selector);
    if (els.length) {
      const value = els.first().attr(attr) || els.first().text();
      if (value) {
        return value;
      }
    }
  }
  return "";
}

function fetchAuthor($) {
  let author =
    fetchJsonLdData($, "author") || fetchDataFromSelectors($, authorSelectors);
  return author;
}

function fetchPublisher($) {
  let publisher = fetchJsonLdData($, "publisher");
  if (!publisher) {
    publisher = fetchDataFromSelectors($, publisherSelectors);
    const copyright = $("body")
      .html()
      .match(/©\s*([^<]*)/);
    if (copyright && copyright[1]) {
      publisher = copyright[1].trim();
    }
  }
  return publisher;
}

function fetchDate($) {
  let date =
    fetchJsonLdData($, "datePublished") ||
    fetchDataFromSelectors($, dateSelectors);
  return date;
}
function fetchWebTitle($) {
  return fetchDataFromSelectors($, webTitleSelectors);
}

function fetchHeadline($) {
  let title;

  // First, try fetching from JSON-LD data
  title = fetchJsonLdData($, "headline");

  // Second, try using other selectors (assuming fetchDataFromSelectors function exists)
  if (!title) {
    title = fetchDataFromSelectors($, articleTitleSelectors); // articleTitleSelectors needs to be defined elsewhere
  }

  // Lastly, as a fallback, use the content of the <title> meta tag
  if (!title) {
    title = $("title").first().text().trim();
  }

  return title;
}

function fetchJsonLdData($, key) {
  const jsonLdScripts = $('script[type="application/ld+json"]');
  for (let i = 0; i < jsonLdScripts.length; i++) {
    try {
      const jsonLd = JSON.parse($(jsonLdScripts[i]).html());
      if (jsonLd && jsonLd[key]) {
        if (key === "author" && Array.isArray(jsonLd[key])) {
          return jsonLd[key]
            .map((author) =>
              typeof author === "object" ? author.name : author
            )
            .join(", ");
        }
        return typeof jsonLd[key] === "object" ? jsonLd[key].name : jsonLd[key];
      }
    } catch (e) {
      // Failed to parse JSON-LD. Move on to the next script.
    }
  }
  return "";
}
