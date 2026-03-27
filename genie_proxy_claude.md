Create an app project with following functionalities:

1. The app should provide access to one or more genie spaces, across workspaces through an API
2. This app should act as a proxy to connect to Genie Spaces on databricks
3. If should forward the requests/responses, back and forth
4. It should use the identity of the user asking the question to access the Genie space and should not use the apps service principal
5. On the home page it should allow to select the Genie space, based on the user permissions
6. once selected, the user should be able to access Genie space, if the request succeeds, its great otherwise if the request fails with 400 (because of the Genie space QPM limits), then the request should be qeued. 
7. For queuing the requests, use Lakebase Autoscaling. Do not use any in-memory database
8. Use the following resorces:
https://databricks.github.io/appkit/
https://github.com/databricks-solutions/apx
https://github.com/shadcn-ui/ui
9. Add a readme file with architecture diagram and details
10. Add a .gitignore file with entries for all the files/folders that need not be checked into git
11. Do not hard code and urls, usernames, passwords, or secrets. Use .env file and provide a .env_template file as a example to check in to git
12. Use databrciks assets bundles to deploy
13. The app should provide an option to simulate the queuing mechanism. It should the queued requests, its status, etc