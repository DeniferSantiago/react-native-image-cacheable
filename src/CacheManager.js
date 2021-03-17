import { WrapperFS } from "../utils/fsUtils";
import {
    getCacheableUrl,
    getImageFilePath,
    getImageRelativeFilePath
} from "../utils/pathUtils";
import _ from "lodash";
import MemoryCache from "react-native-async-storage-cache/MemoryCache";
const defaultOptions = {
    headers: {},
    ttl: 3600 * 24 * 14, // 60 * 60 * 24 * 14, // 2 weeks
    useQueryParamsInCacheKey: false,
    cacheLocation: WrapperFS.getCacheDir(),
    allowSelfSignedSSL: false // false,
};
/**
 * it is considered cacheable if it is a url
 * @param {String} url
 */
function isCacheable(url) {
    return (
        _.isString(url) &&
        (_.startsWith(url.toLowerCase(), "http://") ||
            _.startsWith(url.toLowerCase(), "https://"))
    );
}
/**
 * @param {String} url
 * @param {Object} options
 * @param {(path: String) => Promise<void>} getCachedFile
 */
async function cacheUrl(url, options, getCachedFile) {
    if (!isCacheable(url)) {
        return Promise.reject(new Error("Url is not cacheable"));
    }
    const NewCache = async () => {
        const fileRelativePath_1 = getImageRelativeFilePath(cacheableUrl);
        const filePath = `${options.cacheLocation}/${fileRelativePath_1}`;
        const exist = await WrapperFS.exists(filePath);
        if (exist) await WrapperFS.deleteFile(filePath);
        await getCachedFile(filePath);
        await MemoryCache.set(cacheableUrl, fileRelativePath_1, options.ttl);
        return filePath;
    };
    // cacheableUrl contains only the needed query params
    const cacheableUrl = getCacheableUrl(url, options.useQueryParamsInCacheKey);
    // note: urlCache may remove the entry if it expired so we need to remove the leftover file manually
    try {
        const fileRelativePath = await MemoryCache.get(cacheableUrl);
        if (!fileRelativePath) {
            return NewCache();
        } else {
            // console.log('ImageCacheManager: url cache hit', cacheableUrl);
            const cachedFilePath = `${options.cacheLocation}/${fileRelativePath}`;
            const exist = await WrapperFS.exists(cachedFilePath);
            if (exist) {
                return cachedFilePath;
            } else {
                return NewCache();
            }
        }
    } catch (e) {
        throw e;
    }
}
export class CacheManager {
    constructor(options) {
        this.options = { ...defaultOptions, ...options };
    }
    /**
     * download an image and cache the result according to the given options
     * @param {String} url
     * @param {Object} options override instance options
     */
    downloadAndCacheUrl(url, options = {}) {
        const copy = { ...this.options, ...options };
        return cacheUrl(
            url,
            copy,
            async filePath =>
                await WrapperFS.downloadFile(url, filePath, options.headers)
        );
    }
    /**
     * seed the cache for a specific url with a local file
     * @param {String} url
     * @param {String} seedPath
     * @param options override instance options
     */
    seedAndCacheUrl(url, seedPath, options = {}) {
        const copy = { ...this.options, ...options };
        return cacheUrl(
            url,
            copy,
            async filePath => await WrapperFS.copyFile(seedPath, filePath)
        );
    }
    /**
     * delete the cache entry and file for a given url
     * @param {String} url
     * @param {Object} options override instance options
     */
    async deleteUrl(url, options = {}) {
        try {
            if (!isCacheable(url)) {
                throw new Error("Url is not cacheable");
            }
            const copy = { ...this.options, ...options };
            const cacheableUrl = getCacheableUrl(
                url,
                copy.useQueryParamsInCacheKey
            );
            const filePath = getImageFilePath(cacheableUrl, copy.cacheLocation);
            // remove file from cache
            await MemoryCache.remove(cacheableUrl);
            return await WrapperFS.deleteFile(filePath);
        } catch (e) {
            throw e;
        }
    }
    /**
     * delete all cached file from the filesystem and cache
     */
    async clearCache() {
        await MemoryCache.flush();
        return await WrapperFS.cleanDir(this.options.cacheLocation);
    }
    /**
     * return info about the cache, list of files and the total size of the cache
     */
    getCacheInfo() {
        return WrapperFS.getDirInfo(this.options.cacheLocation);
    }
}