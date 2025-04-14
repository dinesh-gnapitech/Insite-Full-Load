// Copyright: IQGeo Limited 2010-2023
import { ObjectNotFoundError } from 'myWorld-base';

export class BookmarkController {
    constructor({ db }) {
        this.table = db.table('bookmark');
    }

    async get(id) {
        const rec = await this.table.get(id);
        return rec.serialize();
    }

    async getByTitle(username, title) {
        const recs = await this.table
            .where({ myw_search_val1: title.toLowerCase(), username: ['default', username] })
            .orderBy(`username = 'default'`)
            .all();
        if (recs.length === 0) {
            const error = new ObjectNotFoundError('Bookmark does not exist');
            throw error;
        }
        return recs[0].serialize();
    }

    async getAllForUser(username) {
        const recs = await this.table.where({ username: username }).all();
        return recs.map(rec => rec.serialize());
    }

    async save(bookmarkDef) {
        await this.delete(bookmarkDef.myw_search_val1, bookmarkDef.username);
        return this.insert(bookmarkDef);
    }

    delete(searchValue, username) {
        return this.table
            .where({ myw_search_val1: searchValue.toLowerCase(), username: username })
            .delete();
    }

    async insert(bookmarkDef) {
        const recordId = await this.table.insert(bookmarkDef);
        return this.get(recordId);
    }

    async update(id, bookmarkDef) {
        const rec = await this.table.get(id);
        rec.update(bookmarkDef);
        return this.get(id);
    }
}
