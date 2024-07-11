import * as functions from '@google-cloud/functions-framework'
import { SpotifyApi } from '@spotify/web-api-ts-sdk'
import dayjs from 'dayjs'
import dotenv from 'dotenv'
dotenv.config()
const config = process.env
process.env.TZ = 'Asia/Tokyo'
const clientId = config.SPOTIFY_CLIENT_ID || ''
const clientSecret = config.SPOTIFY_CLIENT_SECRET || ''
const playlistId = config.SPOTIFY_SOURCE_PLAYLIST || ''
const newPlaylistId = config.SPOTIFY_NEW_PLAYLIST || ''
const complimentPlaylistId = config.SPOTIFY_COMPLEMENT_PLAYLIST || ''
const refreshToken = config.SPOTIFY_REFRESH_TOKEN || ''


async function main() {
    const current = dayjs().format('YYYY/MM/DD HH:mm') // 説明文の末尾に追加するための日時
    const cred = await getAccessToken()
    const sdk = SpotifyApi.withAccessToken(clientId, cred) // SDK init
    
    const playlist = await sdk.playlists.getPlaylistItems(playlistId) // 日本のTOP 50を取得
    const complimentPlaylist = await sdk.playlists.getPlaylistItems(complimentPlaylistId) // 曲が足りない時に使うやつを取得
    const { items } = playlist // TOP 50の曲たち
    const { items: cItems } = complimentPlaylist // 補完用の曲たち
    const artistIds = items.map((i) => i.track.artists[0].id) // TOP 50の曲たちのアーティストIDを全部持ってくる
    
    const uniqueCItems = cItems.filter((i) => !artistIds.includes(i.track.artists[0].id)) // 補完用のプレイリストからアーティストが被らないものを取得
    const newItems = items.filter(({ track }, i) => {
        const { isrc } = track.external_ids
        return !!isrc.match(/JP/) // ISRCがJPで始まる(いわゆる日本語楽曲)ものだけを取得
    }) // 新しいプレイリストに入る曲たち
    let uris = newItems.map((i) => i.track.uri) // 新しいプレイリストに入る曲たちのURI
    const addTr = 50 - uris.length // 足りない曲の数
    if (addTr >= 0) {
        const uniqueCItemsFor50 = uniqueCItems.slice(0, addTr) // 足りない曲の数だけ補完用のプレイリストから取得
        const uniqueCItemsFor50Uris = uniqueCItemsFor50.map((c) => c.track.uri) // URIだけ取り出す
        uris = uris.concat(uniqueCItemsFor50Uris) // 追加
    }
    await sdk.playlists.updatePlaylistItems(newPlaylistId, { uris }) // 自分のプレイリストに上書き
    await sdk.playlists.changePlaylistDetails(newPlaylistId, {
        name: `トップ50 - 日本語`,
        description: `日本語トップ50 bot GitHub: cutls/spotify-japanese (更新日時: ${current})`
    }) // プレイリストの名前と説明文を更新
    console.log('playlist updated')
}
functions.cloudEvent('makePlaylist', async () => {
    main()
}) // Google Cloud Function用のエントリーポイント
main()
// リフレッシュトークンからアクセストークンを生成
async function getAccessToken () {
    const url = 'https://accounts.spotify.com/api/token'
    const payload = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(clientId + ':' + clientSecret).toString('base64')}`
      },
      body: `grant_type=refresh_token&refresh_token=${refreshToken}&client_id=${clientId}`
    }
    const body = await fetch(url, payload)
    const response = await body.json()
    console.log(response)
    return response
}
