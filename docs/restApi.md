# Rest API (Is bulk api the right name, this api can be used to sync user data to the user as well)

    -   Rethink the name of the api

The bulk api is used by the clients to request bulk data from the api on connect, this is due to socket being inefficient with large amounts of data, and does not have compression

## Ideas

-   The idea with the bulk api is to have pagination build in from the start, that the client request data and the api returns it to the client in chunks

    -   since the api cant push data to the client with the bulk api, the user need to request the data from the api every time
    -   The idea is that the client send the api his latest timestamp on initial connect, and the api returns all data newer that that
    -   Then after the client has received the newest data, the client send his old timestamp to the api, and then the api start returning the data to client in chunks
    -   Every time after the client received a chunk, it does another request to the api, asking for older data, until that api replies to the client that they received app the data available

-   If the client has a older api version than the api server, the server needs to block the users request, and the client needs to be prompted the reload their app in order to receive the latest updates

## Questions

-   How will the api / client handle it when the clients missing newer data is > that the chunk size.
    -   Will it post all the clients data as one chunk, ore will it return the data in pages until the client has all the newest data and then go to the old data
    -   Or will the api return the data in chunks form the newest data the client has, then return a newer chunk every time the user request, until the user has all the newest data?

## Client request data structure

The json data will change based on the request

-   Need to setup dto's to verify that the different request has the right data needed

### Object Structure

-   The client will do a post request to a api endpoint with a json object that will define what data the api will return

#### Base Object

```json
{
    "request": "<client request>",
    "apiVersion": "<client api version>",
    "doc": "<doc with request data>"
}
```

#### Requests

##### reqNewer

-   Return data to user in chunks from the sync version to the latest data, starting with the oldest chunk and working its way up to newer data
    -   We need to think if this is the best way?, if the amount of new date is very big, it will feel buggy to the clients, due to the older data being loaded first

```json
{
    "syncVersion": "<client latest sync version>"
}
```

##### reqOlder

```json
{
    "syncVersionOldest": "<client oldest sync version>"
}
```

## Authentication

-   Authentication will be handled by passing a jwt token in the auth header of the post request to the api
