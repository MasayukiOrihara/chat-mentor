from mcp.server.fastmcp import FastMCP

# FastMCPサーバを初期化
mcp = FastMCP("test")


# ツールを定義。型ヒントやdocstringをきちんと記載する必要がある。
@mcp.tool()
def add(a: int, b: int) -> int:
    """
    二つの整数を受け取り、それらの和を返す関数。

    Args:
        a (int): 最初の整数
        b (int): 二つ目の整数

    Returns:
        int: 足し算の結果
    """
    return a + b

# 実行処理
if __name__ == "__main__":
    mcp.run(transport="stdio")