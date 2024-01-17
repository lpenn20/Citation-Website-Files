import { urlRegex } from "@library/regexes";
import nlp from "compromise";
export const formatData = async (source, mode) => {
  console.log(source,"source")
  const today = new Date();
  const currentDay = today.getDate();
  const currentMonth = today.getMonth() + 1; // Months are 0-based
  const currentYear = today.getFullYear();
  let year, month, day;
  year = currentYear.toString();
  month = currentMonth.toString();
  day = currentDay.toString();

  let citer = await getRidOfHtml(source);

  if (mode && citer.api && citer.api.type) {
    citer.api.initialType = citer.api.type;
  }
  if (citer && citer.info && citer.info.publisher === "YouTube") {
    citer = citer;
  } else {
    let dateClean, titleClean, publisherClean, authorClean, authorCleanFinal;
    // console.log(citer.info?.issued, "YERS");
    if (citer.info?.issued) {
      dateClean = formatDate(citer.info.issued);
    }

    // Check if 'title' property exists
    if (citer.info.title) {
      titleClean = formatTitle(citer.info.title,citer.api.type);
    }

    // Check if 'publisher' property exists
    if (citer.info.publisher) {
      publisherClean = formatPublisher(citer.info.publisher);
    }

    // Check if 'contributor' property exists
    if (citer.info.contributor) {
      authorClean = formatAuthors(citer.info.contributor,citer.api.filter);
      console.log(authorClean,"authorClean")
      authorCleanFinal = sanitizeAuthors(authorClean);
    }
    // Formatting 'contributor' (authors), with a default value as needed


    // Assuming year, month, and day are defined elsewhere in your code
    const accessedDate = { "date-parts": [[year, month, day]] };

    // Update citer.info with cleaned data, using null for undefined values
    citer.info.contributor = authorCleanFinal;
    citer.info.issued = dateClean;
    citer.info.title = titleClean;
    citer.info.publisher = publisherClean;
    citer.info.accessed = accessedDate;
    citer.info.type = citer.api.type;
  }

  const api = formatAPI(citer);

  return api;
};

function formatAPI(citer) {
  if (urlRegex.test(citer.api.searchString)) {
    citer.info.URL = citer.api.searchString;
    citer.api.link = citer.api.searchString;
    citer.api.type = citer.api.type ? citer.api.type : "webpage";
  }

  if (
    citer.info &&
    citer.info.URL &&
    !["software", "webpage", "post-weblog"].includes(citer.api.type)
  ) {
    if (["book", "chapter"].includes(citer.type)) {
      citer.api.accessedType = "Online Ebook";
    } else {
      citer.api.accessedType = "Online";
    }
  }
  if (["book", "chapter"].includes(citer.api.type) && citer.info.DOI) {
    citer.api.accessedType = "Online Ebook";
  }

  return citer;
}

function formatDate(date) {
  if (typeof date !== "string") {
    return date;
  }

  const parsedDate = new Date(date);
  return {
    "date-parts": [
      [
        parsedDate.getFullYear(),
        parsedDate.getMonth() + 1,
        parsedDate.getDate(),
      ],
    ],
  };
}

function formatTitle(title,type) {
  // Check if the title is empty or null
  if (typeof title !== "string") {
    return title;
  }
  if (type === "webpage"){
  // If the title contains a "|", select the string before it
  if (title.includes("|")) {
    title = title.split("|")[0].trim();
  } else if ((title.match(/-/g) || []).length === 1) {
    const regex = / - [A-Z]/;
    if (regex.test(title)) {
      title = title.split(" - ")[0].trim();
    }
  }
  }
  // List of words that should not be capitalized in titles
  const lowercaseWords = [
    "a",
    "an",
    "the",
    "and",
    "but",
    "or",
    "nor",
    "for",
    "so",
    "yet",
    "in",
    "of",
    "to",
    "by",
    "on",
    "at",
    "with",
    "from",
  ];

  // Existing capitalization logic
  return title
  .split(" ")
  .map((word, index, array) => {
    // Check if the word should be capitalized
    const shouldCapitalize = index === 0 ||
      index === array.length - 1 ||
      !lowercaseWords.includes(word.toLowerCase()) ||
      [':', '!', '.'].includes(array[index - 1]?.slice(-1));

    if (shouldCapitalize) {
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    }
    return word.toLowerCase();
  })
  .join(" ");
}

function sanitizeAuthors(authors) {
  if (!Array.isArray(authors)) {
    return authors;
  }

  const allowedFields = [
    "given",
    "family",
    "suffix",
    "sequence",
    "literal",
    "dropping-particle",
    "non-dropping-particle",
    "role",
  ];

  const sanitizeField = (str) => {
    str = String(str);
    str = str.replace(/\(.*?\)|\[.*?\]|\{.*?\}|<.*?>/g, "");
    str = str.replace(/[^\p{L}'-\. ]/gu, ""); // Keep only letters, apostrophes, hyphens, periods, and spaces
    return str;
  };

  const toAppend = new Map(); // Stores suffixes to be appended to previous authors
  const toDelete = new Set(); // Stores indexes of suffix-only authors to be deleted

  // First pass: Identify suffix-only authors and decide their fate
  for (let i = 0; i < authors.length; i++) {
    const author = authors[i];
    if (Object.keys(author).length === 1 && author.hasOwnProperty("suffix")) {
      // Check if previous author exists and doesn't have a suffix
      if (i > 0 && !authors[i - 1].hasOwnProperty("suffix")) {
        toAppend.set(i - 1, author.suffix);
      } else {
        toDelete.add(i);
      }
    }
  }

  // Second pass: Apply sanitization and handle suffix-only authors
  const filteredAuthors = [];

  for (let i = 0; i < authors.length; i++) {
    if (toDelete.has(i)) {
      continue; // Skip authors marked for deletion
    }

    const author = authors[i];

    // Remove fields that are not in the allowed list
    for (const key in author) {
      if (!allowedFields.includes(key)) {
        delete author[key];
      }
    }

    // Clean up each allowed field
    for (const field of allowedFields) {
      if (author.hasOwnProperty(field) && field !== 'literal') {
        author[field] = sanitizeField(author[field]);
      }
    }

    // Append suffix if needed
    if (toAppend.has(i)) {
      if (author.hasOwnProperty("suffix")) {
        author["suffix"] += `, ${toAppend.get(i)}`;
      } else {
        author["suffix"] = toAppend.get(i);
      }
    }

    // Add to filtered list if either "given" or "family" exists
    if (
      author.hasOwnProperty("given") ||
      author.hasOwnProperty("family") ||
      author.hasOwnProperty("literal")
    ) {
      filteredAuthors.push(author);
    }
  }

  return filteredAuthors;
}

function formatAuthors(authorsString, type) {
  if (typeof authorsString !== "string") {
    return authorsString;
  }

  const authors = authorsString.split(",").map((s) => s.trim());
  const formattedAuthors = authors.map((author) =>
    formatAuthorFromFullName(author, type)
  );
  return formattedAuthors;
}

function formatAuthorFromFullName(author, type) {
  // console.log("formatAuthorFromFullName",type)
  const singleLetterAbbreviationRegex =
    /(?<!')\b(?!s\b)[A-Za-z](\.\s+|\s+){1,2}/;
  const prefixRegex = /^(Dr\.|Mr\.|Mrs\.|Ms\.|Miss|Sir|Madam)\s+/i;
  const suffixRegex = /(?:\(?(\b(Jr\.?|Sr\.?|III|IV)\b)\)?)/gi;

  // Removing any prefix from the author's name

  // Removing and saving the suffix

  let authorStr;
  let suffix;
  if (
    singleLetterAbbreviationRegex.test(author) ||
    prefixRegex.test(author) ||
    suffixRegex.test(author)
  ) {
    // console.log("was if")
    authorStr = author.replace(prefixRegex, "");
    authorStr = authorStr.replace(suffixRegex, function (_, match) {
      suffix = match;
      console.log(match)
      return "";
    });
  } else if (type === "PMID") {
    // console.log("was elseif")
    authorStr = author;
  } else {
    // console.log("was else")
    // Check for corporation indicators or numbers other than 1, 2, or 3
    const isPerson = isValidName(author);

    if (!isPerson) {
      return {
        literal: author,
        role: "author",
      };
    } else {
      authorStr = author;
    }
  }

  const sanitizeField = (str) => {
    str = String(str);
    str = str.replace(/\(.*?\)|\[.*?\]|\{.*?\}|<.*?>/g, "");
    str = str.replace(/[^\p{L}'-\. ]/gu, ""); // Keep only letters, apostrophes, hyphens, periods, and spaces
    return str;
  };

  authorStr = sanitizeField(authorStr)
  authorStr = authorStr.replace(/[\.\)]/g, "").trim();
  console.log(authorStr,"after replace")
  let names = authorStr.split(/\s+/);
  console.log(names);
  let firstName = names[0];
  let middleNames = [];
  let lastName = names[names.length - 1];

  if (names.length > 2) {
    middleNames = names.slice(1, -1);
  } else if (names.length === 1) {
    lastName = "";
  }

  let given = [firstName, ...middleNames].join(" ").trim();

  let result = {
    given: given,
    family: lastName,
    suffix: suffix,
    role: "author",
  };

  // Remove empty fields
  Object.keys(result).forEach((key) => {
    if (!result[key]) delete result[key];
  });

  return result;
}

function formatPublisher(str) {
  if (typeof str !== "string") {
    return str;
  }

  const removals = [",", "all rights reserved", "copyright", "inc"];
  let cleanedString = str;

  removals.forEach((removal) => {
    const regex = new RegExp(removal, "gi");
    cleanedString = cleanedString.replace(regex, "");
  });

  // Remove periods only if they are at the end of a sentence or followed by a space
  cleanedString = cleanedString.replace(/\.(\s|$)/g, "$1");

  return cleanedString.trim();
}

export const getRidOfHtml = async (source) => {
  // Helper function to unescape HTML
  const unescapeHTML = (str) => {
    var doc = new DOMParser().parseFromString(str, "text/html");
    return doc.documentElement.textContent;
  };

  // Helper function to remove HTML tags
  const removeHTMLTags = (str) => {
    if (typeof str === "string") {
      const unescapedStr = unescapeHTML(str);

      // Check for the presence of the � symbol
      if (unescapedStr.includes("�")) {
        return null;
      }

      return unescapedStr
        .replace(/<[^>]*>?/gm, "")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;nbsp;/gi, " ")
        .trim();
    }
    return str;
  };

  // Helper function to recursively clean an object
  const recursiveClean = (obj) => {
    if (Array.isArray(obj)) {
      return obj.map((item) => recursiveClean(item));
    } else if (typeof obj === "object" && obj !== null) {
      let newObj = {};
      for (let key in obj) {
        newObj[key] = recursiveClean(obj[key]);
      }
      return newObj;
    } else if (typeof obj === "string") {
      return removeHTMLTags(obj);
    }
    return obj;
  };

  // Now working with a single source object
  return {
    ...source,
    info: recursiveClean(source.info),
  };
};

function isNameWithCompromise(word) {
  const doc = nlp(word);

  // Check if any part of the text is tagged as 'Organization' or 'Acronym'
  let hasCompromisingTag = false;
  if (Array.isArray(doc.document[0]) && doc.document.length > 0) {
    doc.document[0].forEach((chunk) => {
      // Ensure that tags exist and cpnare iterable
      if (chunk.tags && chunk.tags.size > 0) {
        const tags = Array.from(chunk.tags);

        if (
          tags.includes("Organization") ||
          tags.includes("Acronym") ||
          tags.includes("Verb") ||
          tags.includes("Adjective") ||
          tags.includes("Possessive") ||
          // tags.includes("Plural") ||
          tags.includes("Determiner") ||
          tags.includes("Place") ||
          tags.includes("Country")
        ) {
          hasCompromisingTag = true;
          console.log(word,tags,hasCompromisingTag)

        }
        console.log(word,tags,hasCompromisingTag)

      }
    });
  }

  return !hasCompromisingTag;
}

const commonWords = [
  "the",
  "be",
  "to",
  "of",
  "and",
  "a",
  "in",
  "that",
  "have",
  "wikipedia",
  "source",
  "it",
  "for",
  "not",
  "on",
  "with",
  "he",
  "as",
  "you",
  "do",
  "at",
];

function containsCommonWord(input) {
  const words = input.toLowerCase().split(/\W+/); // Split by non-word characters
  return words.some((word) => commonWords.includes(word));
}
function isValidName(input) {
  if (containsCommonWord(input)) {
    return false;
  }
  return isNameWithCompromise(input);
}
