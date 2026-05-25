const path = require("path");
const fs = require("fs");
const webpack = require("webpack");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const CopyWebpackPlugin = require("copy-webpack-plugin");

module.exports = (env, argv) => {
  const isProduction = argv.mode === "production";

  return {
    mode: isProduction ? "production" : "development",
    devtool: isProduction ? "source-map" : "eval-cheap-module-source-map",
    entry: {
      taskpane: "./src/taskpane/taskpane.ts",
      commands: "./src/commands/commands.ts",
    },
    output: {
      filename: "[name].js",
      path: path.resolve(__dirname, "dist"),
      clean: true,
      publicPath: "/",
    },
    module: {
      rules: [
        {
          test: /\.ts$/,
          use: {
            loader: "ts-loader",
            options: { transpileOnly: false },
          },
          exclude: /node_modules/,
        },
      ],
    },
    resolve: {
      extensions: [".ts", ".js"],
    },
    plugins: [
      new webpack.DefinePlugin({
        "process.env.AZURE_FUNCTIONS_URL": JSON.stringify(
          process.env.AZURE_FUNCTIONS_URL ||
            (isProduction
              ? "https://nextage-dlp-api.azurewebsites.net/api"
              : "https://localhost:7071/api"),
        ),
      }),
      new HtmlWebpackPlugin({
        template: "./src/taskpane/taskpane.html",
        filename: "taskpane.html",
        chunks: ["taskpane"],
      }),
      new HtmlWebpackPlugin({
        template: "./src/taskpane/taskpane.html",
        filename: "commands.html",
        chunks: ["commands"],
      }),
      new CopyWebpackPlugin({
        patterns: [
          // Manifests are built by scripts/build-manifests.ts after webpack runs —
          // the raw files contain ${TOKEN} placeholders and must not ship as-is.
          { from: "src/assets", to: "assets", noErrorOnMissing: true },
        ],
      }),
    ],
    devServer: {
      static: { directory: path.join(__dirname, "dist") },
      port: 3000,
      server: certsExist() ? {
        type: "https",
        options: {
          key: fs.readFileSync(path.join(__dirname, "certs/localhost.key")),
          cert: fs.readFileSync(path.join(__dirname, "certs/localhost.crt")),
        },
      } : "https",
      allowedHosts: "all",
      headers: { "Access-Control-Allow-Origin": "*" },
      historyApiFallback: { rewrites: [{ from: /^\/taskpane/, to: "/taskpane.html" }] },
    },
  };
};

function certsExist() {
  const dir = path.join(__dirname, "certs");
  return (
    fs.existsSync(path.join(dir, "localhost.key")) &&
    fs.existsSync(path.join(dir, "localhost.crt"))
  );
}
