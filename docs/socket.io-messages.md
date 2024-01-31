# List of message names used for socket.io communication between the API and client / CMS

| Message name  | Description                   | Use                   | Data                                                      |
| ------------- | ----------------------------- | --------------------- | --------------------------------------------------------- |
| connect       | connection established to API | client & cms built-in | -                                                         |
| clientDataReq | Client data request           | client / cms -> API   | Object with client details such as current update version |
| data          | document transfer             | client / cms <-> API  | Array of document objects                                 |
