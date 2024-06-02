# List of message names used for socket.io communication between the API and client / CMS

| Message name     | Description                                                                                           | Use                   | Data                                                      |
| ---------------- | ----------------------------------------------------------------------------------------------------- | --------------------- | --------------------------------------------------------- |
| connect          | connection established to API                                                                         | client & cms built-in | -                                                         |
| clientDataReq    | Client data request                                                                                   | client / cms -> API   | Object with client details such as current update version |
| data             | Document transfer                                                                                     | API -> client / cms   | Object with Array of document objects and sync version    |
| changeRequest    | Document changes                                                                                      | client / cms -> API   | Array of change requests                                  |
| changeRequestAck | Acknowledgement of change request                                                                     | API -> client / cms   | Acknowledgement of individual change request with status  |
| accessMap        | Map with user specific access (depreciated)                                                           | API -> client / cms   | Object                                                    |
| clientConfig     | Object containing an Access Map (indicating user specific access) and other client configuration data | API -> client / cms   | Object                                                    |
