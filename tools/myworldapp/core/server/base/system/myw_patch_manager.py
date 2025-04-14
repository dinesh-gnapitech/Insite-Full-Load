# ==============================================================================
# myw_patch_manager
# ==============================================================================
# Copyright: IQGeo Limited 2010-2023

import os.path
import pathlib
import datetime
import json
import shutil
import zipfile
import filecmp, tempfile
import getpass
from collections import OrderedDict

from myworldapp.core.server.base.core.myw_error import MywError
from myworldapp.core.server.base.core.myw_os_engine import MywOsEngine
from myworldapp.core.server.base.core.myw_progress import MywProgressHandler


class MywPatchManager:
    """
    Engine for installing patches
    """

    def __init__(self, product, progress=MywProgressHandler()):
        """
        Init slots of self

        PRODUCT_MGR is a MywProduct"""

        self.product = product
        self.progress = progress
        self.os_engine = MywOsEngine(progress)

    def check_patch(self, patch):
        """
        Check if MywPatch PATCH can be applied to self's product

        Returns:
          OK         True if patch is for self's product etc
          REASON     Description of problem (if not OK)"""

        # Check for module not installed
        if not patch.module in self.product.module_names():
            return False, "Module not present: {}".format(patch.module)

        # Check version is correct
        product_version = self.product.module(patch.module).version
        if patch.target != product_version:
            reason = "Version mis-match: Patch target={}({}) : Installed version={}({})".format(
                patch.module, patch.target, patch.module, product_version
            )
            return False, reason

        # Check for patch already installed
        if self.patch_is_installed(patch.id, patch.module):
            return False, "Patch already installed"

        return True, ""

    def find_install_conflicts(self, patch):
        """
        Returns a list of the conflicted files in PATCH

        A conflict is when the 'old' version in the patch does not
        the current version in the product"""

        zip_prefix = "old/"

        conflict_files = OrderedDict()

        with zipfile.ZipFile(patch.zip_file) as patch_zip:
            for change, src_file in patch.changes():

                dst_file = self.product.full_path_for(src_file)

                if change == "A":
                    if os.path.isfile(dst_file):
                        # file exists when it shouldn't yet.
                        conflict_files[src_file] = "local_changes"

                elif change == "M":
                    if not self.files_match(patch_zip, src_file, dst_file, zip_prefix):
                        conflict_files[src_file] = "local_changes"

                elif change == "D":
                    if not os.path.exists(dst_file):
                        conflict_files[src_file] = "missing"
                    elif not self.files_match(patch_zip, src_file, dst_file, zip_prefix):
                        conflict_files[src_file] = "local_changes"

        return conflict_files

    def find_uninstall_conflicts(self, patch):
        """
        Returns a list of the conflicted files in PATCH

        A conflict is when the 'new' version in the patch does not
        the current version in the product"""

        zip_prefix = "new/"

        conflict_files = OrderedDict()

        with zipfile.ZipFile(patch.zip_file) as patch_zip:
            for change, src_file in patch.changes():

                dst_file = self.product.full_path_for(src_file)

                # Note: 'A' here means that uninstall will delete the file, and so on.
                if change == "A":
                    if not os.path.exists(dst_file):
                        conflict_files[src_file] = "missing"
                    elif not self.files_match(patch_zip, src_file, dst_file, zip_prefix):
                        conflict_files[src_file] = "local_changes"

                elif change == "M":
                    if not self.files_match(patch_zip, src_file, dst_file, zip_prefix):
                        conflict_files[src_file] = "local_changes"

                elif change == "D":
                    if os.path.isfile(dst_file):
                        # file exists when it shouldn't yet.
                        conflict_files[src_file] = "local_changes"

        return conflict_files

    def files_match(self, patch_zip, src_file, dst_file, zip_prefix):
        """
        True if the (zip_prefix, old or new) version of SRC_FILE in PATCH_ZIP is different from
        DST_FILE
        """
        # ENH: find way to ignore line ending differences
        scratch_file = patch_zip.extract(zip_prefix + src_file, self.scratch_dir)

        return filecmp.cmp(dst_file, scratch_file)

    @staticmethod
    def install_backup_suffix(patch_id):
        return ".~" + patch_id

    @staticmethod
    def uninstall_backup_suffix(patch_id):
        return ".~u" + patch_id

    # Patch Installation

    def apply_patch(self, patch):
        """
        Apply the changes in MywPatch PATCH

        Returns list of files that were changed"""

        with self.progress.operation("Applying patch:", patch.id):

            conflicts = len(self.find_install_conflicts(patch)) > 0

            # Apply the changes
            changed_files = []
            changes_successfully_applied = []

            with zipfile.ZipFile(patch.zip_file) as patch_zip:
                try:
                    for change, src_file in patch.changes():

                        dst_file = self.product.full_path_for(src_file)

                        # Make the change
                        try:
                            if change == "A":
                                self.progress(1, "Adding", dst_file)
                                self.install_file(patch, patch_zip, src_file, dst_file)

                            elif change == "M":
                                self.progress(1, "Updating", dst_file)
                                self.install_file(patch, patch_zip, src_file, dst_file)

                            elif change == "D":
                                self.progress(1, "Deleting", dst_file)
                                self._perform_install_backup(patch, dst_file)
                                self.os_engine.remove_if_exists(dst_file)
                        except:
                            # If we hit an error, make sure we didn't leave a backup file.
                            backup_file = dst_file + self.install_backup_suffix(patch.id)
                            self.os_engine.remove_if_exists(backup_file)
                            raise

                        changed_files.append(dst_file)
                        changes_successfully_applied.append((change, src_file, dst_file))
                except Exception as e:
                    # Inform the user that something went wrong, rollback changed files from this
                    # patch, and suggest a correction (install with apache stopped.)
                    self.progress(1, "Problem detected", repr(e))
                    self.progress(1, "Rolling back partially applied patch")
                    self.rollback_install_files(patch_zip, patch, changes_successfully_applied)
                    self.progress(
                        "warning",
                        f"Rollback suceeded. Please stop apache before installing {patch.id} again.",
                    )
                    # Finally, we raise an error that should cause the whole process to stop here
                    # (and give the user even more info.)
                    raise MywError(str(e))

            # Update list of installed patches
            self.record_change(patch.module, patch.id, patch.title, True, conflicts)

            # Stash a copy of what we installed
            patch_dir = self.product.module(patch.module).file("installed_patches")
            dst_file = os.path.join(patch_dir, os.path.basename(patch.zip_file))
            self.os_engine.ensure_exists(patch_dir)
            self.os_engine.copy_file(patch.zip_file, dst_file, overwrite=True)

        return changed_files

    def install_file(self, patch, patch_zip, src_file, dst_file):
        """
        Install the 'new' copy of SRC_FILE from PATCH
        """
        # ENH: Use os_engine

        self._perform_install_backup(patch, dst_file)

        # Extract file to a temp location
        tmp_file = patch_zip.extract("new/" + src_file, self.scratch_dir)
        self.progress(4, "Extracted:", tmp_file)

        # It is possible that the patch has been uninstalled before. We won't restore any backup
        # file from that here, but we will notify the user if it exists.
        uninstall_backup_file = dst_file + self.uninstall_backup_suffix(patch.id)
        if os.path.isfile(uninstall_backup_file):
            # If the backup file is the same as the file we just extracted, then no warning is required.
            if not filecmp.cmp(tmp_file, uninstall_backup_file):
                self.progress(
                    "warning",
                    f"Detected uninstall backup {uninstall_backup_file}, which is modified. Please check.",
                )

        # Install it
        try:
            self.progress(2, "Copying:", tmp_file, "->", dst_file)
            # Ensure the containing directory exists:
            dst_dir = os.path.dirname(dst_file)
            pathlib.Path(dst_dir).mkdir(parents=True, exist_ok=True)
            # Actually copy the file:
            shutil.copyfile(tmp_file, dst_file)

        # Clean up
        finally:
            self.os_engine.remove_if_exists(tmp_file)

    def _perform_install_backup(self, patch, dst_file):
        # Save a copy of the orginal file (if necessary)
        if os.path.exists(dst_file):
            backup_file = dst_file + self.install_backup_suffix(patch.id)
            self.progress(4, "Saving backup:", backup_file)
            shutil.copyfile(dst_file, backup_file)

    def rollback_install_files(self, patch_zip, patch, changes_successfully_applied):
        """
        Rollback the parts of a patch which were applied (or removed) before an error occurred.
        """

        for change, src_file, dst_file in changes_successfully_applied:

            backup_file = dst_file + self.install_backup_suffix(patch.id)

            self.progress(1, "Undoing changes to", dst_file)

            if change == "A":
                if os.path.isfile(backup_file):
                    # Even when adding a file, with --force the file could already have existed.
                    shutil.copyfile(backup_file, dst_file)
                else:
                    self.os_engine.remove_if_exists(dst_file)

            elif change == "M":
                if os.path.isfile(backup_file):
                    shutil.copyfile(backup_file, dst_file)
                else:
                    tmp_file = patch_zip.extract("old/" + src_file, self.scratch_dir)
                    shutil.copyfile(tmp_file, dst_file)

            elif change == "D":
                if os.path.isfile(backup_file):
                    shutil.copyfile(backup_file, dst_file)
                else:
                    tmp_file = patch_zip.extract("old/" + src_file, self.scratch_dir)
                    shutil.copyfile(tmp_file, dst_file)

            self.os_engine.remove_if_exists(backup_file)

    # Patch Uninstallation

    def uninstall_patch(self, patch, dry_run):
        """
        Uninstall patch.
        """

        with self.progress.operation("Removing patch:", patch.id):

            changes_successfully_applied = []
            backup_files_to_remove = []

            with zipfile.ZipFile(patch.zip_file) as patch_zip:
                try:
                    for change, src_file in patch.changes():

                        dst_file = self.product.full_path_for(src_file)

                        if dry_run:
                            self.progress(1, "Restore", dst_file)

                        else:
                            backup_file = dst_file + self.install_backup_suffix(patch.id)

                            # Make the change
                            self.progress(1, "Restoring", dst_file)

                            if change == "A":
                                self.uninstall_added_file(patch, dst_file)

                            elif change == "M":
                                self.uninstall_file(patch, patch_zip, src_file, dst_file)

                            elif change == "D":
                                self.uninstall_file(patch, patch_zip, src_file, dst_file)

                            changes_successfully_applied.append((change, src_file, dst_file))
                            backup_files_to_remove.append(backup_file)
                except Exception as e:
                    # Inform the user that something went wrong, rollback changed files from this
                    # patch, and suggest a correction (install with apache stopped.)
                    self.progress(1, "Problem detected", str(e))
                    self.progress(1, "Rolling back partially applied patch")
                    self.rollback_uninstall_files(patch_zip, patch, changes_successfully_applied)
                    self.progress(
                        "warning",
                        f"Rollback suceeded. Please stop apache before removing {patch.id} again.",
                    )
                    # Finally, we raise an error that should cause the whole process to stop here
                    # (and give the user even more info.)
                    raise MywError(str(e))

            if not dry_run:
                # Only try to remove backup files after we know the uninstallation has succeeded. Ignore
                # any backup files which fail to be removed.
                for backup_file in backup_files_to_remove:
                    try:
                        self.os_engine.remove_if_exists(backup_file)
                    except:
                        pass

                # Update the install record
                self.record_change(patch.module, patch.id, "", False)

                # Remove the stashed patch
                self.os_engine.remove_if_exists(patch.zip_file)

    def uninstall_file(self, patch, patch_zip, src_file, dst_file):
        """
        Install the 'old' copy of SRC_FILE from PATCH, or restore from a backup file.
        """

        # Save a copy of the orginal file (if necessary)
        self._perform_uninstall_backup(patch, dst_file)

        source_file = dst_file + self.install_backup_suffix(patch.id)

        if not os.path.isfile(source_file):
            # Extract file from original zip to a temp location
            source_file = patch_zip.extract("old/" + src_file, self.scratch_dir)
            self.progress(4, "Extracted:", source_file)

        # Install it
        self._reverse_file_install(source_file, dst_file)

    def uninstall_added_file(self, patch, dst_file):
        """
        Restore from a backup file, or remove the file completely.
        """

        # Even when adding a file, with --force the file could already have existed.
        # In that case, we restore from backup. Otherwise, we delete.

        # Save a copy of the orginal file (if necessary)
        self._perform_uninstall_backup(patch, dst_file)

        install_backup_file = dst_file + self.install_backup_suffix(patch.id)

        if not os.path.isfile(install_backup_file):
            # No file to restore.
            self.os_engine.remove_if_exists(dst_file)
        else:
            self._reverse_file_install(install_backup_file, dst_file)

    def _perform_uninstall_backup(self, patch, dst_file):
        if os.path.exists(dst_file):
            backup_file = dst_file + self.uninstall_backup_suffix(patch.id)
            self.progress(4, "Saving backup:", backup_file)
            shutil.copyfile(dst_file, backup_file)

    def _reverse_file_install(self, source_file, dst_file):
        self.progress(2, "Copying:", source_file, "->", dst_file)
        # Ensure the containing directory exists:
        dst_dir = os.path.dirname(dst_file)
        pathlib.Path(dst_dir).mkdir(parents=True, exist_ok=True)
        # Actually copy the file:
        shutil.copyfile(source_file, dst_file)

    def rollback_uninstall_files(self, patch_zip, patch, changes_successfully_applied):
        """
        Rollback the parts of a patch which were applied (or removed) before an error occurred.
        """

        for change, src_file, dst_file in changes_successfully_applied:
            # This is a failed uninstall. Do not remove _install_ backup files, only uninstall ones.
            uninstall_backup_file = dst_file + self.uninstall_backup_suffix(patch.id)

            self.progress(1, "Undoing changes to", dst_file)

            # We will restore:
            # - the actual file contents:
            #  - from the uninstall backup, if possible, otherwise
            #  - from the zip new/ folder.

            if change == "A":
                if os.path.isfile(uninstall_backup_file):
                    shutil.copyfile(uninstall_backup_file, dst_file)
                else:
                    tmp_file = patch_zip.extract("new/" + src_file, self.scratch_dir)
                    shutil.copyfile(tmp_file, dst_file)

            elif change == "M":
                if os.path.isfile(uninstall_backup_file):
                    shutil.copyfile(uninstall_backup_file, dst_file)
                else:
                    tmp_file = patch_zip.extract("new/" + src_file, self.scratch_dir)
                    shutil.copyfile(tmp_file, dst_file)

            elif change == "D":
                # We have restored this from somewhere, but that backup is not removed. Safe to
                # just delete.
                self.os_engine.remove_if_exists(dst_file)

            # Note: we're only removing the uninstall backup file, the original installation backup
            # file should be safe and sound.
            self.os_engine.remove_if_exists(uninstall_backup_file)

    def module_for(self, patch_id):
        """
        The module in which PATCH_ID is installed (if any)
        """

        for module_name in self.product.module_names():
            if patch_id in self.installed_patches(module_name):
                return module_name

        return None

    def record_change(self, module, patch_id, title, installed=True, conflicts=False):
        """
        Update the list of installed patches for MODULE

        INSTALL indicates whether the package was installed or uninstalled"""

        user = getpass.getuser()
        applied = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        # Get list of installed patches
        installed_patches = self.installed_patches(module)

        # Add or remove entry
        if installed:
            installed_patches[patch_id] = {
                "title": title,
                "applied": applied,
                "user": user,
                "conflicts": conflicts,
            }
        else:
            installed_patches.pop(patch_id, None)

        # Save it back to disk
        # ENH: Implement os_engine.dump_json()
        patches_file = self.patch_info_file_for(module)
        with open(patches_file, "w") as strm:
            json.dump(installed_patches, strm, indent=3)

    def patch_is_installed(self, patch_id, module):
        """
        True if PATCH_ID is already installed
        """

        return patch_id in self.installed_patches(module)

    def installed_patches(self, module):
        """
        Returns a list of patch details, keyed by patch_id
        """

        patches_file = self.patch_info_file_for(module)

        if os.path.exists(patches_file):
            with open(patches_file, "r") as strm:
                installed_patches = json.load(strm)
        else:
            installed_patches = {}

        return OrderedDict(sorted(installed_patches.items()))

    def patch_info_file_for(self, module):
        """
        The file listing the installed patches for MODULE
        """

        return self.product.module(module).file("patch_info.json")

    def is_patch(self, file_name):
        """
        True if FILE_NAME is a valid myWorld patch

        Returns:
         IS_PATCH
         REASON"""

        try:
            with zipfile.ZipFile(file_name, "r") as file_zip:

                for filename in file_zip.namelist():
                    if filename == "patch_info.json":
                        return True, ""

                reason = "Does not contain patch_info.json"

        except (IOError, zipfile.BadZipfile):
            reason = "Bad zip file"

        return False, reason

    @property
    def scratch_dir(self):
        """
        A scratch directory for use during installing patches
        """
        # ENH: Returns new dir each time? .. so not a property

        return self.os_engine.ensure_exists(tempfile.gettempdir(), "myw_product_install")
