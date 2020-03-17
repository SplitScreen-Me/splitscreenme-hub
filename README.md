# Basic API :
                     Handler research:
                         url: "api/v1/handlers/:search_text",
                         httpMethod: "get"
                     
                     Specific handler infos:
                        url: "api/v1/handler/:handler_id",
                         httpMethod: "get"
                     	
                     Get available packages for one handler:
                         url: "api/v1/packages/:handler_id",
                         httpMethod: "get"
                     	
                     Get package info:
                         url: "api/v1/packages/:package_id",
                         httpMethod: "get"
                     
                     Get comments done by users about a handler:
                         url: "api/v1/comments/:handler_id",
                         httpMethod: "get"
                     
                     Download a package from it's ID:
                     	url: /cdn/storage/packages/:package_id/original/handler-{handler_id}-v{version_of_handler}.nc?download=true
                     	httpMethod: "get"