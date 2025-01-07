# Rest API

The rest api is used by the clients to request bulk data from the api on connect, this is due to socket being inefficient with large amounts of data, and does not have compression

## Drawing

![png](./docs-api-sync.png)

## Concept

-   The rest api works with a pagination principal,
    -   When a client connect the client request for the newest data of a specific doc type (This is done for all the doc types), the api will return the newest chuck of data for the specific doc type (Chunk is 100 docs)
    -   After the client has received the chunk of data, the client will insert a block in the syncMap, to keep track what data is already synced
    -   When the syncMap is updated, the client will start filling the gaps in data (see picture) to try and create a complete data set
    -   Each time after the client receives a chunk of data, the client will insert the data into the sync map, and then try to merge blocks that is overlapping, in order to keep the sync map clean
    -   The client will stop requesting data once it detects that it does not receive any new chunks anymore

## Client request structure (POST request to api, endpoint: docs)

```js
type ApiQuery = {
    apiVersion: string,
    gapEnd?: number,
    gapStart?: number,
    contentOnly?: boolean,
    type?: string,
    accessMap: AccessMap,
};
```

## API response structure

```js
type DbQueryResult = {
    docs: Array<any>,
    warnings?: Array<string>,
    version?: number,
    blockStart?: number,
    blockEnd?: number,
    accessMap?: AccessMap,
    type?: DocType,
    contentOnly?: boolean,
};
```

## Requests

-   The api will return data based on the time stamps being passed to it.
    -   If only a gapStart timestamp is passed, the api will return the newest chunk of data to the client
    -   If a gapStart and a gapEnd timestamp is passed, the api will return then newest chunk of data between the 2 timestamps supplied

## Authentication

-   Authentication will be handled by passing a jwt token in the auth header of the post request to the api
