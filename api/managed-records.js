import fetch from "../util/fetch-fill";
import URI from "urijs";

// /records endpoint
window.path = "http://localhost:3000/records";
const endpoint = window.path;
const PAGE_COUNT = 10;
const OPEN = "open";
const PRIMARY_COLORS = ["red", "blue", "yellow"];

// Your retrieve function plus any additional functions go here ...

/*
    A pipe method utility function to clean up the URL / Query
    string building process, allows each step to be isolated & pure.
*/
const _pipe = (f, g) => (...args) => g(f(...args));
const pipe = (...fns) => fns.reduce(_pipe);

const results = (options, url) =>
  pipe(
    createReq,
    mapEntries,
    buildQuery,
    processURI,
    fetch,
    resolv,
    transform
  )(options, url);

/*
    Accept request params, and convert options object to API format
*/
const createReq = ({ colors, page } = {}, url) => {
  const options = { limit: PAGE_COUNT };
  if (colors) options.colors = colors;
  if (page && page !== 1) options.offset = page ? (page - 1) * PAGE_COUNT : 0;
  else options.offset = 0;
  return {
    options,
    url
  };
};

/*
    Returns key/value array pairs to format options object for URI api.
*/
const mapEntries = ({ options, url }) =>
  Object.entries(options)
    .map(e => [resolveColors(e)])
    .reduce(format)
    .map(i => URI(url).addSearch(i[0], "" + i[1]));

/*
    Create format for color entries backend API Is expecting
*/
const resolveColors = ([key, val]) => {
  if (Array.isArray(val)) {
    return val.map(v => ["color[]", v]);
  }

  return [key, val];
};

/*
    Flatten any key / value nested arrays one level deep.
*/
const format = (prev, curr) => {
  if (prev && prev[0][0] && Array.isArray(prev[0][0])) {
    return prev.reduce((p, c) => p.concat(c)).concat(curr);
  } else if (curr && curr[0][0] && Array.isArray(curr[0][0])) {
    return prev.concat(curr[0].map(i => i));
  }

  return prev.concat(curr);
};

/*
    Method to combine the URI arrays into one, combining each query along the way.
*/
const buildQuery = entries => {
  const built = entries.reduce((acc, val) =>
    Object.assign(acc, joinQueries(acc, val))
  );

  return built;
};

const processURI = ({ _parts: { path, port, hostname, protocol, query } }) => {
  const currentURL =
    protocol + "://" + hostname + ":" + port + path + "?" + query;
  // window.currentURL is added for the testing environment so i can
  // retrieve it later. Normally I would get this information from the response
  // object later on when needed - to avoid any globally mutable variables.
  window.currentURL = currentURL;

  return currentURL;
};

/*
    Combines object query string, and returns new object.
*/
const joinQueries = (a, v) => {
  const obj = v;
  const joined = a._parts.query + "&" + v._parts.query;
  obj._parts.query = joined;
  return obj;
};

/*
    Verify valid results from server, transfer relevant info via promise
    to next function chain. catch and handle errors.
*/
const resolv = res =>
  res
    .then(res =>
      promiseWrapper({
        headers: res.headers,
        status: res.status,
        statusText: res.statusText,
        url: res.url,
        data: res.json()
      })
    )
    .catch(console.log);

/* 
    Perform the data transformation after a series of promise results
    to the server for next page, and after loading response data promises.
*/
const transform = res =>
  res
    .then(res => {
      const { offset = 0 } = URI.parseQuery(
        URI(window.currentURL)._parts.query
      );
      const prevPage = +offset / PAGE_COUNT;
      // Send request to check for next page.
      return fetch(
        processURI(
          URI(window.currentURL)
            .removeSearch("offset")
            .addSearch("offset", +offset + 10)
        )
      )
        .then(next => {
          // Read next page results
          return next
            .json()
            .then(nextResults => {
              // Check if next page exists, calculate next page
              const isNext = nextResults.length > 0;
              const calcNext = +offset / PAGE_COUNT + 2;
              const nextPage = isNext ? calcNext : null;
              return promiseWrapper(
                // Read original request results, and format data.
                res.data
                  .then(d => {
                    const mapped = d.map(formatObjects);
                    // Return promise containing transformed data.
                    return promiseWrapper({
                      ids: d.map(({ id }) => id),
                      open: mapped.filter(item => item.disposition === OPEN),
                      closedPrimaryCount: mapped.filter(
                        ({ disposition, isPrimary }) =>
                          disposition !== OPEN && isPrimary
                      ).length,
                      previousPage: prevPage > 0 ? prevPage : null,
                      nextPage: nextPage
                    });
                  })
                  .catch(console.log)
              );
            })
            .catch(console.log);
        })
        .catch(console.log);
    })
    .catch(console.log);

/*
    Helper method for mapping the response objects.
*/
const formatObjects = ({ id, color, disposition }) => ({
  id,
  color,
  disposition,
  isPrimary: setPrimaryStatus(color)
});

/*
    Helper method to determine if primary color.
*/
const setPrimaryStatus = color => {
  if (PRIMARY_COLORS.includes(color)) {
    return true;
  }

  return false;
};

/*
    Helper method for maintaining async process
*/
const promiseWrapper = data =>
  new Promise((res, rej) => res(data)).catch(console.log);

/* 
********************************************************
RETRIEVE FUNCTION
********************************************************
*/

const retrieve = (options, url = window.path) =>
  results(options, url).catch(err => console.log("ERROR IN RETRIEVE", err));

export default retrieve;
