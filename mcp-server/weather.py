from typing import Any
import httpx
from mcp.server.fastmcp import FastMCP

# FastMCP server の初期化
mcp = FastMCP("weather")

# 定数
NWS_API_BASE = "https://api.weather.gov"
USER_AGENT = "weather-app/1.0"

"""
NWS APIのヘルパー関数を定義
NWSから天気アラートを非同期で取得 → 読みやすく整形する
"""
async def make_nws_request(url: str) -> dict[str, Any] | None:
    # APIに送るリクエストヘッダーを定義
    headers = {
        "User-Agent": USER_AGENT,
        "Accept": "application/geo+json"
    }
    async with httpx.AsyncClient() as client:
        # 非同期でのHTTPリクエスト
        try:
            response = await client.get(url, headers=headers, timeout=30.0)
            response.raise_for_status()
            return response.json()
        except Exception:
            return None

def format_alert(feature: dict) -> str:
    # NWS APIから取得したアラートデータを人が読みやすい形式に変換
    props = feature["properties"]
    return f"""
Event: {props.get('event', 'Unknown')}
Area: {props.get('areaDesc', 'Unknown')}
Severity: {props.get('severity', 'Unknown')}
Description: {props.get('description', 'No description available')}
Instructions: {props.get('instruction', 'No specific instructions provided')}
"""

@mcp.tool()
async def get_alerts(state: str) -> str:
    """米国の州の天気予報を取得します。

    引数:
        state: 指定した州の2文字コード (例: CA, NY)
    """
    
    # NWS APIにアクセスして、指定州のアクティブな警報を取得
    url = f"{NWS_API_BASE}/alerts/active/area/{state}"
    data = await make_nws_request(url)

    # 取得失敗やデータがなければエラーメッセージを返す
    if not data or "features" not in data:
        return "アラートを取得できないか、アラートが見つかりません."

    # アラートが空なら「なし」と伝える
    if not data["features"]:
        return "この州にはアクティブなアラートはありません."

    # format_alert() 関数で、各アラートを整形して文字列にして返す
    alerts = [format_alert(feature) for feature in data["features"]]
    return "\n---\n".join(alerts)

@mcp.tool()
async def get_forecast(latitude: float, longitude: float) -> str:
    """特定の場所の天気予報を取得します。

    引数:
        latitude: 場所の緯度
        longitude: 場所の経度
    """
    # ポイントエンドポイントにアクセスし、その地点に紐づいた天気予報のURLを取得
    points_url = f"{NWS_API_BASE}/points/{latitude},{longitude}"
    points_data = await make_nws_request(points_url)

    if not points_data:
        return "この場所の予測データを取得できません."

    # そのURLにアクセスして、天気予報の中身を取得
    forecast_url = points_data["properties"]["forecast"]
    forecast_data = await make_nws_request(forecast_url)

    if not forecast_data:
        return "詳細な予測を取得できません."

    # 期間を読みやすい予測にフォーマットする
    periods = forecast_data["properties"]["periods"]
    
    # 最初の5つの期間について、整形してリストに追加
    forecasts = []
    for period in periods[:5]:  # Only show next 5 periods
        forecast = f"""
{period['name']}:
Temperature: {period['temperature']}°{period['temperatureUnit']}
Wind: {period['windSpeed']} {period['windDirection']}
Forecast: {period['detailedForecast']}
"""
        forecasts.append(forecast)

    # 見やすく区切って、文字列で返す
    return "\n---\n".join(forecasts)

if __name__ == "__main__":
    # 初期化 & サーバー起動
    mcp.run(transport='stdio')