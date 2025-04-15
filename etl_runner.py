import os
from utils.config_loader import load_config
from utils.logger import setup_logger
from utils.def_handler import handle_def_file_and_create_table
from utils.db_connections import get_mssql_conn, get_postgres_conn
from utils.etl_executor import run_etl_for_table

def main():
    config = load_config("config.json")
    logger = setup_logger(config["log_folder"])

    mssql_conn = get_mssql_conn(config["source_database"])
    pg_conn = get_postgres_conn(config["target_database"])

    for table_config in config["tables"]:
        logger.info("🚀 Starting ETL for: %s.%s", table_config['target_schema'], table_config['target_table'])

        def_file_name = table_config["def_file_name"]
        source_def_path = os.path.join(config["def_file_folder"]["source_path"], def_file_name)

        # Create table directly using .def file from source path
        handle_def_file_and_create_table(
            source_def_path,
            config["target_database"],
            table_config["target_table"],
            logger
        )

        run_etl_for_table(
            mssql_conn,
            pg_conn,
            table_config,
            config["chunk_size"],
            logger
        )

    mssql_conn.close()
    pg_conn.close()
    logger.info(" ETL process completed for all tables.")

if __name__ == "__main__":
    main()
