// ==UserScript==
// @name         slither debug
// @version      0.1
// @description  install with Tampermonkey (https://tampermonkey.net/)
// @author       john.koepi / sitano, stacs
// @match        http://slither.io
// @grant        none
// ==/UserScript==

/*jshint esnext: true */

var Vector2 = (function() {
    var Vector2 = function(x,y) {
        this.x = x;
        this.y = y;
    };

    Vector2.prototype.magnitude = function() {
        return Math.hypot(this.x,this.y);
    };

    Vector2.prototype.norm = function() {
        var mag = this.magnitude();
        return new Vector2(this.x/mag,this.y/mag);
    };

    Vector2.prototype.scalarMul = function(scalar) {
        return new Vector2(scalar*this.x, scalar*this.y);
    };

    Vector2.prototype.add = function(otherVec) {
        return new Vector2(this.x + otherVec.x, this.y + otherVec.y);
    };

    Vector2.prototype.sub = function(otherVec) {
        return new Vector2(this.x - otherVec.x, this.y - otherVec.y);
    };

    Vector2.prototype.toString = function() {
        return "(" + this.x + ", " + this.y + ")";
    };

    Vector2.prototype.angle = function() {
        var ang = Math.atan2(this.y,this.x);
        if(ang < 0) {
            ang += Math.PI*2;
        }
        return ang;
    };

    Vector2.prototype.gameDirection = function() {
        return (125 / Math.PI) * this.angle();
    };

    return Vector2;
})();

if (!String.prototype.format) {
  String.prototype.format = function() {
    var args = arguments;
    return this.replace(/{(\d+)}/g, function(match, number) {
      return typeof args[number] != 'undefined' ? args[number] : match
      ;
    });
  };
}

function appendDiv(id, className, style) {
    var div = document.createElement("div");
    if (id) {
        div.id = id;
    }
    if (className) {
        div.className = className;
    }
    if (style) {
        div.style = style;
    }
    return document.body.appendChild(div);
}

(function() {
    'use strict';

    // CONSTANTS
    const fov = 124; // Food gathering field of view (0-250)

    // STATE
    var snakeDirV = new Vector2(0,0);
    var snakePosV = new Vector2(0,0);

    var enabled = true;
    var draw = true;
    var log = false;
    var filter = false;

    var packetTime = [];
    var moveTime = [];
    var snakePos = [];
    var snakeRot = [ /* dir = -1, ang = -1, wang = -1, sp = -1 */];

    var gameFPS = null;
    var positionHUD = null;
    var ipHUD = null;
    var fpsHUD = null;
    var debugHUD = null;
    var styleHUD = "color: #FFF; font-family: Arial, 'Helvetica Neue', Helvetica, sans-serif; font-size: 14px; position: fixed; opacity: 0.35; z-index: 7;";

    // UI STUFF
    var status = "STARTING...";

    var zoom = function(e) {
        if (!window.gsc) {
            return;
        }
        window.gsc *= Math.pow(0.9, e.wheelDelta / -120 || e.detail / 2 || 0);
    };

    var initMouseWheel = function() {
        if (/firefox/i.test(navigator.userAgent)) {
            document.addEventListener("DOMMouseScroll", zoom, false);
        } else {
            document.body.onmousewheel = zoom;
        }
    };

    document.addEventListener('keydown', function(e) {
        if (e.keyCode == 65 /* a */) {
            enabled = !enabled;
        }

        if (e.keyCode == 76 /* l */) {
            log = !log;
        }

        if (e.keyCode == 70 /* f */) {
            filter = !filter;
        }

        if (e.keyCode == 84 /* t */) {
            if (!window.pfd) {
                window.pfd = document.createElement("div");
                pfd.style.position = "fixed";
                pfd.style.left = "4px";
                pfd.style.bottom = "69px";
                pfd.style.width = "400px";
                pfd.style.height = "100px";
                pfd.style.background = "rgba(0, 0, 0, .8)";
                pfd.style.color = "#80FF80";
                pfd.style.fontFamily = "Verdana";
                pfd.style.zIndex = 999999;
                pfd.style.fontSize = "11px";
                pfd.style.padding = "10px";
                pfd.style.borderRadius = "30px";
                pfd.textContent = "Testing HUD";
                document.body.appendChild(window.pfd);
            }

            testing = !testing;

            if (testing) {
                pfd.style.display = "block";
            } else {
                pfd.style.display = "none";
            }
        }

        if (e.keyCode == 67 /* c */) {
            window.bso = {
                ip: "127.0.0.1",
                po: 8080
            };
            window.forcing = true;
            window.want_play = true;
        }
    }, false);

    var repaintInfoHud = function() {
        if (!ipHUD) {
            ipHUD = appendDiv("ip-hud", "nsi", styleHUD + "right: 30; bottom: 150px;");
        }
        if (!positionHUD) {
            positionHUD = appendDiv("position-hud", "nsi", styleHUD + "right: 30; bottom: 120px;");
        }
        if (!fpsHUD) {
            fpsHUD = appendDiv("fps-hud", "nsi", styleHUD + "right: 30; bottom: 170px;");
        }

        if (positionHUD) {
            positionHUD.textContent = "X: " + (~~window.view_xx || 0) + " Y: " + (~~window.view_yy || 0);
        }

        if (fpsHUD && window.fps && window.lrd_mtm) {
            if (Date.now() - window.lrd_mtm > 970) {
                fpsHUD.textContent = "FPS: " + window.fps;
            }
        }

        if (ipHUD && window.bso) {
            var currentIP = window.bso.ip + ":" + window.bso.po;
            ipHUD.textContent = "IP: " + currentIP;
        }
    };

    var repaintDebugHud = function() {
        if (!debugHUD) {
            debugHUD = appendDiv("debug-hud", "nsi", styleHUD + "left: 30px; top: 150px;");
        }

        var html = "Debug by john.koepi / sitano, stacs";
        html += "<br/>-----------------------------------";
        html += "<br/>" + "Auto " + (enabled?"on":"off") + " - press 'a' to toggle (" + "status: " + status + ")";
        html += "<br/>" + "Log " + (log?"on":"off") + " - press 'l' to toggle, press 'f' to filter " + (filter?"on":"off");
        html += "<br/>" + "Testing " + (testing?"on":"off") + " - press 't' to toggle";
        html += "<br/>" + "Connect to 127.0.0.1:8080 - press 'c'<br />";
        if (playing) {
            html += "<br/>" + "packet timing = " + packetTime;
            html += "<br/>" + "move timing = " + moveTime;
            html += "<br/>" + "rotation = " + snakeRot;
            // fam - 0..1 ratio to the next body increment
            // sct - live body parts count
            html += "<br/>" + "fam: {0}, sct: {1}".format(snake.fam, snake.sct);
            html += "<br/>" + "sp = {0}, tsp = {1}, fsp = {2}, sfr = {3}, msl = {4}".format(snake.sp, snake.tsp, snake.fsp, snake.sfr, snake.msl);
            html += "<br/>" + "fltg = {0}".format(snake.fltg);
            html += "<br/>" + "spang = {0}, sc = {1}, scang = {2}".format(snake.spang, snake.sc, snake.scang);
            html += "<br/>" + "chl = {0}".format(snake.chl);
        }
        debugHUD.innerHTML = html;
    };

    var distToPlayer = function(food) {
        return Math.abs(food.rx - snake.xx) + Math.abs(food.ry - snake.yy);
    };

    // Returns a score of how desirable a piece of food is for the player
    var foodScore = function(food) {
        var foodSize = food.sz;

        return foodSize/distanceToFood(food);
    };

    var distanceToFood = function(food) {
        return snakePosV.sub(new Vector2(food.rx,food.ry)).magnitude();
    };

    var foodWithinFov = function(food) {
        var towardsFood = directionTowards(new Vector2(food.rx, food.ry));
        var snakeDir = snakeDirV.gameDirection();
        return (gameAngleDifference(towardsFood, snakeDir) < (fov/2));
    };

    // Returns the piece of food the player will move towards
    // This is determined by calling "foodScore" on each piece of food
    var closestFood = function() {
        var best = foods.filter(function(food) {
            if (!food) return false;

            if (distanceToFood(food) > 60) {
                return true;
            } else {
                if (foodWithinFov(food)) {
                    return true;
                } else {
                    return false;
                }
            }
        }).reduce(function(best,current) {
            // Find the piece of food with the best score
            if (!best) throw "No foods :(";
            if (!current) return best;
            return foodScore(best) > foodScore(current) ? best : current;
        }, {xx: 0, yy: 0, sz: 1});

        return best;
    };

    var directionTowards = function(towardsPos) {
        return towardsPos.sub(snakePosV).gameDirection();
    };

    var gameAngleDifference = function(a, b) {
        var phi = Math.abs(b - a) % 250;
        return phi > 125 ? 250 - phi : phi;
    };

    // ----- INTERFACE -----
    var setDirection = function(direction) {
        if (!enabled) {
            return;
        }

        if (direction >= 0 && direction <= 250) {
            var ang = 2 * direction * Math.PI / 256;
            var angV = new Vector2(Math.cos(ang), Math.sin(ang));
            window.xm = 100 * angV.x;
            window.ym = 100 * angV.y;
        } else {
            console.err("Invalid turn angle: " + direction);
        }
    };

    var enterSpeedMode = function() {
        sendPacket(253);
    };

    var exitSpeedMode = function() {
        sendPacket(254);
    };

    var sendPacket = function(val) {
        var packet = new Uint8Array(1);
        packet[0] = val;
        if (ws && ws.readyState == 1) {
            ws.send(packet);
        }
    };

    var getDrawPosition = function(vec) {
        return new Vector2(mww2 + (vec.x - view_xx) * gsc, mhh2 + (vec.y - view_yy) * gsc);
    };

    var drawLineOverlay = function(destination, thickness, colorString) {
        var canvas = document.getElementsByTagName("canvas")[2];

        var ctx = canvas.getContext("2d");
        ctx.strokeStyle = colorString;
        ctx.lineWidth = thickness;

        ctx.beginPath();
        var to = getDrawPosition(destination);
        ctx.moveTo(to.x, to.y);

        var from = getDrawPosition(snakePosV);
        ctx.lineTo(from.x, from.y);
        ctx.stroke();
    };

    var drawLineOverlay2 = function(from, to, thickness, colorString) {
        var canvas = document.getElementsByTagName("canvas")[2];

        var ctx = canvas.getContext("2d");
        ctx.strokeStyle = colorString;
        ctx.lineWidth = thickness;

        ctx.beginPath();
        from = getDrawPosition(from);
        ctx.moveTo(from.x,from.y);
        to = getDrawPosition(to);
        ctx.lineTo(to.x,to.y);
        ctx.stroke();
    };

    var drawPoint = function(at, thickness, colorString) {
        var canvas = document.getElementsByTagName("canvas")[2];

        var ctx = canvas.getContext("2d");
        ctx.strokeStyle = colorString;
        ctx.lineWidth = thickness;

        ctx.beginPath();
        at = getDrawPosition(at);
        ctx.fillRect(p.x, p.y, thickness, thickness);
        ctx.stroke();
    };

    var drawPoints = function(pts, thickness, colorString) {
        var canvas = document.getElementsByTagName("canvas")[2];

        var ctx = canvas.getContext("2d");
        ctx.strokeStyle = colorString;
        ctx.lineWidth = thickness;

        ctx.beginPath();
        for each (var p in pts) {
            p = getDrawPosition(p);
            ctx.fillRect(p.x, p.y, thickness, thickness);
        }
        ctx.stroke();
    };

    var packetTypes = {
        a: "Initial setup",
        e: "Snake rotation ccw (?dir ang ?wang ?sp)",
        E: "Snake rotation ccw (dir wang ?sp)",
        3: "Snake rotation ccw (dir ang wang | sp)",
        4: "Snake rotation clockwise (dir wang ?sp)",
        5: "Snake rotation clockwise (dir ang wang)",
        h: "Update snake fam",
        r: "Remove snake part",
        g: "Move snake",
        G: "Move snake",
        n: "Increase snake",
        N: "Increase snake",
        l: "Leaderboard",
        v: "dead/disconnect packet",
        W: "Add Sector",
        w: "Remove Sector",
        m: "Global highscore",
        p: "Pong",
        u: "Update minimap",
        s: "Add/remove Snake",
        F: "Add Food",
        b: "Add Food",
        f: "Add Food",
        c: "Food eaten",
        j: "Update Prey",
        y: "Add/remove Prey",
        k: "Kill (unused in the game-code)"
    };

    var ssgOriginal = window.startShowGame;
    window.startShowGame = function() {
        ssgOriginal();
        var onmessageOriginal = ws.onmessage;
        ws.onmessage = function(msg) {
            var c = new Uint8Array(msg.data);
            if (2 <= c.length) {
                var lptm = window.cptm; // last time
                var cptm = Date.now(); // current time

                var cltm = c[0] << 8 | c[1]; // time since last message from client
                var dtm = cptm - lptm; // delta time last message from server
                if (!lptm) { dtm = 0; }
                // etm += Math.max(-180, Math.min(180, srvtm - cltm)); // [180; 180 + 180]

                packetTime = [dtm, cltm, Math.max(-180, Math.min(180, dtm - cltm))];

                var packetType = String.fromCharCode(c[2]); // packet type
                var i = 3; // next byte

                var playerSnakeId = window.snake ? window.snake.id : 0;
                var xx = 0, yy = 0;

                if ("g" == packetType || "n" == packetType || "G" == packetType || "N" == packetType) {
                    var snakeId = c[i] << 8 | c[i + 1]; i += 2; // snake id
                    var snake = os["s" + snakeId]; // snake

                    if (3 <= protocol_version) {
                        if ("g" == packetType || "n" == packetType) {
                            xx = c[i] << 8 | c[i + 1]; i += 2;
                            yy = c[i] << 8 | c[i + 1]; i += 2;
                        } else {
                            var head = snake.pts[snake.pts.length - 1];

                            xx = head.xx + c[i] - 128; i++;
                            yy = head.yy + c[i] - 128; i++;
                        }
                    } else {
                        xx = (c[i] << 16 | c[i + 1] << 8 | c[i + 2]) / 5; i += 3;
                        yy = (c[i] << 16 | c[i + 1] << 8 | c[i + 2]) / 5; i += 3;
                    }

                    if (log && (!filter || playerSnakeId)) {
                        console.info("{0} ({1}ms): packet {2}, snake s{3} [{4}]"
                                     .format(cptm, dtm, packetType + "/" + packetTypes[packetType], snakeId, [xx, yy]));
                    }

                    if (snake == window.snake) {
                        snakePos.push(new Vector2(xx, yy));

                        if (moveTime.length < 2) {
                            moveTime = [ Date.now(), 0, 0, 0 ];
                        } else {
                            var last = snakePos.length;

                            moveTime[1] = Date.now() - moveTime[0];
                            moveTime[0] = Date.now();

                            moveTime[2] = Math.round(snakePos[last - 2].sub(snakePos[last - 1]).magnitude()); // offset per step
                            moveTime[3] = Math.round(moveTime[2] * 200 / moveTime[1]); // normalized step speed to 200ms
                        }

                        if (snakePos.length > 20) {
                            snakePos.shift();
                        }
                    }
                } else if ("e" == packetType || "E" == packetType || "3" == packetType || "4" == packetType || "5" == packetType) {
                    const left = 1;
                    const right = 2;

                    var dir = -1, ang = -1, wang = -1, sp = -1;
                    var packetLen2 = c.length - 2;

                    var snakeId = c[i] << 8 | c[i + 1]; i += 2; // snake id

                    if (6 <= protocol_version) {
                        if (6 == packetLen2) {
                            // "e" - left, "4" - right
                            dir = "e" == packetType ? left : right;
                            ang = 2 * c[i] * Math.PI / 256; i++;
                            wang = 2 * c[i] * Math.PI / 256; i++;
                            sp = c[i] / 18;
                        } else {
                            if (5 == packetLen2) {
                                if ("e" == packetType) {
                                    ang = 2 * c[i] * Math.PI / 256; i++;
                                    sp = c[i] / 18;
                                } else {
                                    if ("E" == packetType) {
                                        dir = left;
                                        wang = 2 * c[i] * Math.PI / 256; i++;
                                        sp = c[i] / 18;
                                    } else {
                                        if ("4" == packetType) {
                                            dir = right;
                                            wang = 2 * c[i] * Math.PI / 256; i++;
                                            sp = c[i] / 18;
                                        } else {
                                            if ("3" == packetType) {
                                                dir = left;
                                                ang = 2 * c[i] * Math.PI / 256; i++;
                                                wang = 2 * c[i] * Math.PI / 256;
                                            } else {
                                                if ("5" == packetType) {
                                                    dir = right;
                                                    ang = 2 * c[i] * Math.PI / 256; i++;
                                                    wang = 2 * c[i] * Math.PI / 256;
                                                }
                                            }
                                        }
                                    }
                                }
                            } else {
                                if (4 == packetLen2) {
                                    if ("e" == packetType) {
                                        ang = 2 * c[i] * Math.PI / 256;
                                    } else {
                                        if ("E" == packetType) {
                                            dir = left;
                                            wang = 2 * c[i] * Math.PI / 256;
                                        } else {
                                            if ("4" == packetType) {
                                                dir = right;
                                                wang = 2 * c[i] * Math.PI / 256;
                                            } else {
                                                if ("3" == packetType) {
                                                    sp = c[i] / 18;
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    } else {
                        if (3 <= protocol_version) {
                            if ("3" != packetType) {
                                if (8 == packetLen2 || (7 == packetLen2 || (6 == packetLen2 && "3" != packetType || 5 == packetLen2 && "3" != packetType))) {
                                    dir = "e" == packetType ? 1 : 2;
                                }
                            }
                            if (8 == packetLen2 || (7 == packetLen2 || (5 == packetLen2 && "3" == packetType || 6 == packetLen2 && "3" == packetType))) {
                                ang = 2 * (c[i] << 8 | i[i + 1]) * Math.PI / 65535;
                                i += 2;
                            }
                            if (8 == packetLen2 || (7 == packetLen2 || (5 == packetLen2 && "3" != packetType || 6 == packetLen2 && "3" != packetType))) {
                                wang = 2 * (c[i] << 8 | i[i + 1]) * Math.PI / 65535;
                                i += 2;
                            }
                            if (8 == packetLen2 || (6 == packetLen2 || 4 == e)) {
                                sp = c[i] / 18;
                            }
                        } else {
                            if (11 == q || (8 == q || (9 == q || 6 == q))) {
                                dir = c[i] - 48;
                                i++;
                            }
                            if (11 == q || (7 == q || (9 == q || 5 == q))) {
                                ang = 2 * (c[i] << 16 | i[i + 1] << 8 | i[i + 2]) * Math.PI / 16777215;
                                i += 3;
                            }
                            if (11 == q || (8 == q || (9 == q || 6 == q))) {
                                wang = 2 * (c[i] << 16 | i[i + 1] << 8 | i[i + 2]) * Math.PI / 16777215;
                                i += 3;
                            }
                            if (11 == q || (7 == q || (8 == q || 4 == q))) {
                                sp = (c[i] << 8 | i[i + 1]) / 1E3;
                            }
                        }
                    }

                    var snake = os["s" + snakeId]; // snake
                    var dAng = -1;
                    var spang = -1;
                    if (snake) {
                        if (-1 != ang) {
                            dAng = (ang - snake.ang) % pi2;
                            if (0 > dAng) { dAng += pi2; }
                            if (dAng > Math.PI) { dAng -= pi2; }
                        }
                        if (-1 != sp) {
                            spang = snake.sp / spangdv;
                            if (1 < snake.spang) { spang = 1; }
                        }
                    }

                    if (log && (!filter || playerSnakeId)) {
                        console.info("{0} ({1}ms): packet {2}, snake s{3} [dir = {4}, ang = {5}, wang = {6}, sp = {7}, dAng = {8}, spang = {9}]"
                                     .format(cptm, dtm, packetType + "/" + packetTypes[packetType], snakeId, dir, ang, wang, sp, dAng, spang));
                    }

                    if (snake == window.snake) {
                        snakeRot = [dir, ang, wang, sp];
                    }
                } else if ("W" == packetType) {
                    xx = c[i]; i ++;
                    yy = c[i]; i ++;

                    if (log && (!filter || playerSnakeId)) {
                        console.info("{0} ({1}ms): packet {2}, [{3}]"
                                     .format(cptm, dtm, packetType + "/" + packetTypes[packetType], [xx, yy]));
                    }
                } else if ("w" == packetType) {
                    if (8 <= protocol_version) {
                        xx = c[i] << 8 | c[i + 1]; i += 2;
                        yy = c[i] << 8 | c[i + 1]; i += 2;
                    } else {
                        // f = c[i] ?? add if == 1
                        i ++;
                        xx = c[i] << 8 | c[i + 1]; i += 2;
                        yy = c[i] << 8 | c[i + 1]; i += 2;
                    }

                    if (log && (!filter || playerSnakeId)) {
                        console.info("{0} ({1}ms): packet {2}, [{3}]"
                                     .format(cptm, dtm, packetType + "/" + packetTypes[packetType], [xx, yy]));
                    }
                } else {
                    if (log && (!filter || playerSnakeId)) {
                        var snakeId = c[i] << 8 | c[i + 1]; i += 2; // snake id
                        if (!os[snakeId]) { snakeId = 0; }
                        console.info("{0} ({1}ms): packet {2}, snake s{3}".format(cptm, dtm, packetType + "/" + packetTypes[packetType], snakeId));
                    }
                }
            }

            onmessageOriginal.apply(ws, [msg]);
        };
    };

    // ----- /INTERFACE -----
    var render = function() {
        repaintInfoHud();
        repaintDebugHud();

        try {
            var sumVec = new Vector2(0,0);
            var playerSnakeId = window.snake ? window.snake.id : 0;

            for (var snakeId in os) {
                if (os.hasOwnProperty(snakeId)) {
                    if (snakeId != "s" + playerSnakeId) {
                        // Opponent Snake
                        var currentSnake = os[snakeId];

                        for (var point in currentSnake.pts) {
                            var pt = currentSnake.pts[point];
                            var opponentSegmentPos = new Vector2(pt.xx,pt.yy);

                            var vecToOpponent = opponentSegmentPos.sub(snakePosV);
                            var opponentMagnitude = vecToOpponent.magnitude();

                            var normVec = vecToOpponent.norm();
                            var vectorInverse = normVec.scalarMul(3600/(gsc * (Math.pow(opponentMagnitude, 2))));
                            sumVec = sumVec.add(vectorInverse);
                        }
                    }
                }
            }

            sumVec = sumVec.scalarMul(-1);
            var threshold = sumVec.magnitude();

            if (threshold > 1) {
                var avoidDirection = directionTowards(snakePosV.add(sumVec));
                status = "avoiding threat, threshold: " + threshold.toFixed(2);
                setDirection(avoidDirection);
                // drawLineOverlay(snakePosV.add(sumVec.norm().scalarMul(200)), threshold * 10, "#FF0000");
            } else {
                if (!foods.length) {
                    setDirection(directionTowards(new Vector2(grd/2, grd/2)));
                    status = "returning to centre";
                } else {
                    var closest = closestFood();
                    status = "feeding, threshold: " + threshold.toFixed(2);
                    setDirection(directionTowards(new Vector2(closest.rx, closest.ry)));
                    // drawLineOverlay(new Vector2(closest.rx, closest.ry), 7, "#7FFF00");
                }
            }

            if (snake) {
                var newSnakePosV = new Vector2(snake.xx, snake.yy);
                snakeDirV = newSnakePosV.sub(snakePosV);
                snakePosV = newSnakePosV;

                // Snake Position
                drawLineOverlay(snakePosV.add(snakeDirV.scalarMul(10)), 1, "#00FF00");
                // drawLineOverlay(snakePosV.add(new Vector2(snake.fx, snake.fy)), 1, "#FF0000");

                if (snakeRot.length > 0) {
                    // ang = current snake angle
                    var ang = snakeRot[1];
                    if (ang != -1) {
                        drawLineOverlay(newSnakePosV.add(new Vector2(Math.cos(ang), Math.sin(ang)).scalarMul(50)), 1, "#FF0000");
                    }
                    // wang = target angle
                    var wang = snakeRot[2];
                    if (wang != -1) {
                        drawLineOverlay(newSnakePosV.add(new Vector2(Math.cos(wang), Math.sin(wang)).scalarMul(50)), 1, "#0000FF");
                    }
                }

                drawPoints(snakePos, 2, "#FFFFFF");

                // Snake parts
                for (var pi in snake.pts) {
                    var part = snake.pts[pi];
                    var pos = new Vector2(part.xx, part.yy);
                    drawLineOverlay2(pos, pos.add(new Vector2(part.ebx, part.eby)), 1, "#F0F0FF");
                    drawLineOverlay2(pos, pos.add(new Vector2(part.fx, part.fy)), 1, "#FF0000");
                }
            }
        } catch (e) {
            console.log("Error caught: " + e);
        }

        raf(render);
    };

    raf(render);

    initMouseWheel();
})();
