# Routes configuration
#
# The more specific and detailed routes should be defined first so they
# may take precedent over the more generic routes. For more information
# refer to the routes manual at http://routes.groovie.org/docs/
#
# Copyright: IQGeo Limited 2010-2023


def add_routes(config):
    """
    Add core routes to routing map MAP
    """

    config.add_controller("error_controller")

    # Primary route
    config.add_route("", "index_controller", "base")
    config.add_route("/index", "index_controller", "index", setup_slash_redirector=True)
    config.add_route("/{application}.html", "index_controller", "directToApplication")

    # Tile data access
    config.add_route(
        "/tile/{universe}/{layer_or_world}/{zoom}/{x}/{y}.{format}",
        "myw_tile_controller",
        "get_tile",
    )

    # Feature data access (from client, view limited by current user's roles)
    config.add_route("/select", "myw_select_controller", "select_near")
    config.add_route("/select_within", "myw_select_controller", "select_within")
    config.add_route("/search", "myw_search_controller", "index")
    config.add_route("/search_features", "myw_search_controller", "features")
    config.add_route("/feature/{feature_type}", "myw_feature_controller", "no_id")
    config.add_route("/feature/{feature_type}/get", "myw_feature_controller", "query_post")
    config.add_route("/feature/{feature_type}/count", "myw_feature_controller", "count")
    config.add_route("/feature/{feature_type}/{id}", "myw_feature_controller", "with_id")
    config.add_route(
        "/feature/{feature_type}/{id}/relationship/{field_name}",
        "myw_feature_controller",
        "relationship",
    )
    config.add_route("/feature", "myw_feature_controller", "transaction")
    config.add_route("/feature_bulk", "myw_feature_controller", "bulk_update")
    config.add_route(
        "/feature/{feature_type}/{id}/networks", "myw_network_controller", "feature_networks"
    )

    # Network operations
    config.add_route("/network/{network}/trace_out", "myw_network_controller", "trace_out")
    config.add_route("/network/{network}/shortest_path", "myw_network_controller", "shortest_path")

    # Data download
    config.add_route("/export_csv", "myw_export_csv_controller", "generate")
    config.add_route("/export_json", "myw_export_json_controller", "generate")
    config.add_route("/export_dxf", "myw_export_dxf_controller", "generate")

    # System data access (from client, view limited by current user's roles)
    config.add_route("/layer/{layer_name}/features", "myw_render_controller", "get")
    config.add_route(
        "/layer/{layer_name}/tile/{z}/{x}/{y}.json", "myw_render_controller", "json_tile"
    )
    config.add_route(
        "/layer/{layer_name}/tile/{z}/{x}/{y}.mvt", "myw_render_controller", "mvt_tile_by_layer"
    )
    config.add_route("/render_features", "myw_render_controller", "mvt_tile_by_params")
    config.add_route("/dd/{datasource}", "myw_dd_controller", "index")
    config.add_route("/system/username", "myw_current_user_controller", "get_name")
    config.add_route("/system/roles", "myw_current_user_controller", "get_roles")
    config.add_route("/system/rights", "myw_current_user_controller", "get_rights")

    config.add_route("/system/application", "myw_application_controller", "index")
    config.add_route(
        "/system/application/{application_name}/startup",
        "myw_application_controller",
        "get_startup_info",
    )
    config.add_route(
        "/system/application/{application_name}/{username}/state",
        "myw_application_controller",
        "state",
    )

    config.add_route(
        "/system/datasource/{name}/tunnel", "myw_datasource_controller", "tunnel_request"
    )

    config.add_route("/system/layer/by_name/{name}", "myw_layer_controller", "get_by_name")
    config.add_route("/system/layer_file/{layer_name}", "myw_layer_controller", "get_file")
    config.add_route("/system/layer_group", "myw_layer_group_controller", "index")

    config.add_route("/system/private_layer", "myw_private_layer_controller", "no_id")
    config.add_route("/system/private_layer/{id}", "myw_private_layer_controller", "with_id")

    config.add_route("/system/bookmark", "myw_bookmark_controller", "no_id")
    config.add_route("/system/bookmark/{id}", "myw_bookmark_controller", "with_id")
    config.add_route("/system/bookmark/by_name/{title}", "myw_bookmark_controller", "get_by_name")

    config.add_route("/system/group_ids", "myw_group_controller", "get_ids")
    config.add_route("/system/group", "myw_group_controller", "create")
    config.add_route("/system/group/{id}", "myw_group_controller", "with_id")

    config.add_route("/system/setting", "myw_setting_controller", "index")
    config.add_route("/system/notification", "myw_notification_controller", "index")
    config.add_route("/system/version_stamp", "myw_version_stamp_controller", "index")
    config.add_route("/system/module", "myw_module_controller", "index")

    config.add_route("/system/usage", "myw_usage_controller", "create")
    config.add_route("/system/usage/settings", "myw_usage_controller", "settings")
    config.add_route("/system/usage/{id}", "myw_usage_controller", "update")

    config.add_route("/system/crs", "myw_crs_controller", "list")
    config.add_route("/system/crs/{crs}", "myw_crs_controller", "get")

    config.add_route("/system/kmz/{layer_name}", "myw_kmz_controller", "get_kmz_layer")
    config.add_route(
        "/system/kmz/{layer_name}/{file_in_kmz}", "myw_kmz_controller", "get_kmz_layer_file"
    )
    config.add_route(
        "/system/kmz/file/{kmz_file}/{file_in_kmz}", "myw_kmz_controller", "get_kmz_file"
    )

    config.add_route("/system/role/{role_name}", "myw_role_controller", "lookup_role")

    # Extract downloads
    config.add_route("/extracts/list", "myw_extract_download_controller", "list")
    config.add_route(
        "/extracts/{folder_name}/metadata", "myw_extract_download_controller", "metadata"
    )
    config.add_route(
        "/extracts/{folder_name}/file/{filename}", "myw_extract_download_controller", "file"
    )
    config.add_route("/extracts/{folder_name}/key", "myw_extract_download_controller", "key")

    # System data access (from config application, full view)
    config.add_route("/config/enumerator", "myw_dd_enum_controller", "no_name")
    config.add_route("/config/enumerator/{name}", "myw_dd_enum_controller", "with_name")

    config.add_route("/config/dd/{datasource}", "myw_dd_feature_controller", "index")
    config.add_route("/config/dd/{datasource}/feature", "myw_dd_feature_controller", "create")
    config.add_route(
        "/config/dd/{datasource}/feature/{feature_type}",
        "myw_dd_feature_controller",
        "with_feature_type",
    )
    config.add_route(
        "/config/dd/{datasource}/feature/{feature_type}/count", "myw_dd_feature_controller", "count"
    )
    config.add_route(
        "/config/dd/{datasource}/feature/{feature_type}/check_filter",
        "myw_dd_feature_controller",
        "check_filter",
    )
    config.add_route(
        "/config/dd/{datasource}/import/{feature_type}",
        "myw_dd_feature_controller",
        "import_feature",
    )
    config.add_route("/config/dd/{datasource}/import", "myw_dd_feature_controller", "import_dd")

    config.add_route("/config/dd/{datasource}/fields", "myw_dd_controller", "fields")
    config.add_route("/config/dd/{datasource}/basic", "myw_dd_controller", "features_basic")
    config.add_route("/config/dd/{datasource}/searches", "myw_dd_controller", "searches")
    config.add_route("/config/dd/{datasource}/queries", "myw_dd_controller", "queries")
    config.add_route("/config/dd/{datasource}/filters", "myw_dd_controller", "filters")

    config.add_route("/config/datasource", "myw_datasource_controller", "no_name")
    config.add_route("/config/datasource/{name}", "myw_datasource_controller", "with_name")
    config.add_route(
        "/config/datasource/{name}/tunnel", "myw_datasource_controller", "tunnel_config_request"
    )

    config.add_route("/config/layer", "myw_layer_controller", "no_id")
    config.add_route("/config/layer/{id}", "myw_layer_controller", "with_id")

    config.add_route("/config/layer_group", "myw_layer_group_controller", "no_id")
    config.add_route("/config/layer_group/{id}", "myw_layer_group_controller", "with_id")

    config.add_route("/config/network", "myw_network_controller", "no_name")
    config.add_route("/config/network/{name}", "myw_network_controller", "with_name")

    config.add_route("/config/application", "myw_application_controller", "no_id")
    config.add_route("/config/application/{id}", "myw_application_controller", "with_id")

    config.add_route("/config/role", "myw_role_controller", "no_id")
    config.add_route("/config/role/{id}", "myw_role_controller", "with_id")

    config.add_route("/config/rights", "myw_right_controller", "index")

    config.add_route("/config/user", "myw_user_controller", "no_id")
    config.add_route("/config/user/{id}", "myw_user_controller", "with_id")

    config.add_route("/config/setting", "myw_setting_controller", "no_id")
    config.add_route("/config/setting/{id}", "myw_setting_controller", "with_id")

    config.add_route("/config/notification", "myw_notification_controller", "no_id")
    config.add_route("/config/notification/{id}", "myw_notification_controller", "with_id")

    config.add_route("/config/task/{id}", "myw_task_controller", "get")
    config.add_route("/config/upload_data", "myw_upload_data_controller", "create")

    config.add_route("/config/table_set", "myw_table_set_controller", "no_id")
    config.add_route("/config/table_set/{id}", "myw_table_set_controller", "with_id")

    config.add_route("/config/extract", "myw_extract_controller", "index")
    config.add_route("/config/extract/{name}", "myw_extract_controller", "with_name")
    config.add_route("/config/extract_role", "myw_extract_controller", "list_by_role")
    config.add_route("/config/extract_role/{role}", "myw_extract_controller", "with_role")

    config.add_route("/config/replica", "myw_replica_controller", "index")
    config.add_route("/config/replica/{id}", "myw_replica_controller", "show")

    # Replica synchronisation
    config.add_route("/sync/register/{extract_type}", "myw_sync_controller", "register_replica")
    config.add_route(
        "/sync/master/{extract_type}/index.json", "myw_sync_controller", "list_master_updates"
    )
    config.add_route(
        "/sync/master/{extract_type}/{update_id}.zip",
        "myw_sync_controller",
        "download_master_update",
    )
    config.add_route("/sync/{replica_id}", "myw_sync_controller", "update_replica")
    config.add_route("/sync/{replica_id}/allocate_shard", "myw_sync_controller", "allocate_shard")
    config.add_route(
        "/sync/{replica_id}/{update_id}.zip", "myw_sync_controller", "upload_replica_update"
    )
    config.add_route("/sync/{replica_id}/status", "myw_sync_controller", "update_replica_status")
    config.add_route("/sync/{replica_id}/logs", "myw_sync_controller", "store_client_logs")
    config.add_route("/sync/{replica_id}/drop", "myw_sync_controller", "drop_replica")

    # On-demand extraction
    config.add_route("/snapshot/extract/{table_set}", "myw_snapshot_controller", "extract")

    # Authentication
    config.add_route("/auth_options", "myw_auth_controller", "auth_options")
    config.add_route("/login", "myw_auth_controller", "index", setup_slash_redirector=True)
    config.add_route("/auth", "myw_auth_controller", "authenticate")
    config.add_route("/auth/sso/{engine}", "myw_auth_controller", "single_sign_on")
    config.add_route("/auth/anywhere/{engine}", "myw_auth_controller", "authenticate_anywhere")
    config.add_route("/auth/attach", "myw_auth_controller", "attach")
    config.add_route("/logout", "myw_auth_controller", "logout", setup_slash_redirector=True)

    # Documentation access
    config.add_route("/doc/*file_id", "file", "serve_doc")
    config.add_route("/doc_file/{lang}/*file_id", "file", "serve_doc_for")

    # Delta
    config.add_route("/delta/{feature_type}/{id}/features", "myw_delta_controller", "index")
    config.add_route("/delta/{feature_type}/{id}/conflicts", "myw_delta_controller", "conflicts")
    config.add_route("/delta/{feature_type}/{id}/resolve", "myw_delta_controller", "resolve")
    config.add_route("/delta/{feature_type}/{id}/promote", "myw_delta_controller", "promote")
    config.add_route("/delta/{feature_type}/{id}/delete", "myw_delta_controller", "delete")
