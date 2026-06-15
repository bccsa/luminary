# Automated testing

## API

Jest (included with NestJS) is used for automated API unit testing. Pre-test logic is run in [/api/jest.setup.ts](/api/jest.setup.ts) and includes database seeding from [/api/src/db/designDocs](/api/src/db/designDocs) and [/api/src/db/seedingDocs](/api/src/db/seedingDocs).

The Jest unit testing currently does not include teardown logic (see note below on why we are not cleaning up testing data).

Note: Destroying documents does not delete them from the CouchDB database, but marks them as deleted.
This does not work well with testing where we reuse the testing database (i.e. local testing
on your computer) since CouchDB / nano complains that the document is deleted and hence cannot
be created. In real life scenarios recreating a deleted document should never occur, and
if it does this would be an exception that should be logged to an error log instead of
being processed.
It therefore does not work to destroy our testing data set for local testing - the developer
can rather delete the testing database on his computer once in a while if it gets too big.
