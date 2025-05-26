import os
from mcp.server.fastmcp import FastMCP
from dotenv import load_dotenv
import requests
from datetime import datetime
import re

load_dotenv()
TAVILY_API_KEY = os.getenv("TAVILY_API_KEY")

# FastMCPサーバを初期化
mcp = FastMCP("test")


# ツールを定義。型ヒントやdocstringをきちんと記載する必要がある。
@mcp.tool()
def search_web(word: str) -> str:
    """
    検索ワードを受け取り、検索結果を文字列で返す関数。

    Args:
        word (str): 検索ワード

    Returns:
        str: 検索の結果
    """
    
    def search_web_with_tavily(query: str, num_results: int = 5) -> str:
        url = "https://api.tavily.com/search"
        headers = {
            "Content-Type": "application/json",
        }
        payload = {
            "api_key": TAVILY_API_KEY,
            "query": query,
            "search_depth": "basic",
            "max_results": num_results,
        }

        response = requests.post(url, headers=headers, json=payload)
        response.raise_for_status()
        results = response.json()

        # 結果をテキストとして結合
        snippets = [item.get("content", "") for item in results.get("results", [])]
        return "\n\n".join(snippets)
    
    return search_web_with_tavily(word)

@mcp.tool()
def search_web_freestyle(word: str) -> str:
    """
    株式会社フリースタイル関係の検索ワードを受け取り、検索結果を文字列で返す関数。

    Args:
        word (str): 検索ワード

    Returns:
        str: 検索の結果
    """
    
    def search_web_with_tavily(query: str, num_results: int = 5) -> str:
        url = "https://api.tavily.com/search"
        headers = {
            "Content-Type": "application/json",
        }
        payload = {
            "api_key": TAVILY_API_KEY,
            "query": query,
            "search_depth": "basic",
            "max_results": num_results,
        }

        response = requests.post(url, headers=headers, json=payload)
        response.raise_for_status()
        results = response.json()

        # 結果をテキストとして結合
        snippets = [item.get("content", "") for item in results.get("results", [])]
        return "\n\n".join(snippets)
    
    query = "site:freestyles.jp " + word
    return search_web_with_tavily(query)

@mcp.tool()
def search_weather(area: str) -> str:
    """
    地域を受け取り、天気予報の検索結果を文字列で返す関数。

    Args:
        area (str): 検索対象の地域

    Returns:
        str: 天気予報の検索結果
    """
    url = "https://www.jma.go.jp/bosai/common/const/area.json"
    response = requests.get(url)
    response.raise_for_status()
    data = response.json()

    def find_codes_by_keyword(data, keyword):
        results = []
        def search(obj, path=""):
            if isinstance(obj, dict):
                for k, v in obj.items():
                    search(v, f"{path}/{k}")
            elif isinstance(obj, list):
                for i, v in enumerate(obj):
                    search(v, f"{path}[{i}]")
            else:
                if isinstance(obj, str) and keyword in obj:
                    results.append(path)
        search(data)
        return results

    pathCode_find = find_codes_by_keyword(data, area)
    pathCode = [re.findall(r'\d+', path)[-1] for path in pathCode_find]
    print(pathCode)

    # 気象庁データの取得
    for code in pathCode:
        jma_url = "https://www.jma.go.jp/bosai/forecast/data/forecast/"+ code + ".json"
        try:
            jma_json = requests.get(jma_url).json()
        except requests.exceptions.JSONDecodeError:
            continue

        jma_date = jma_json[0]
    
    return jma_date

@mcp.tool()
def get_today() -> str:
    """
    今日の日付と時間を文字列で返す関数。

    Returns:
        str: 今日の日付と時間
    """
    return datetime.today()

@mcp.tool()
def calculator(expr: str) -> str:
    """
    計算式を文字列で受け取って、結果を文字列で返す関数。
    
    Args:
        expr(str): 文字列の計算式

    Returns:
        str: 計算結果
    """
    return eval(expr)

# 実行処理
if __name__ == "__main__":
    mcp.run(transport="stdio")